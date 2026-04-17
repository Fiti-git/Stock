import os
import re
import subprocess
import time
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.db import connection
from django.http import FileResponse, Http404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

BACKUPS_DIR = Path("/app/backups")
SAFE_NAME = re.compile(r"^[A-Za-z0-9_.\-]+\.sql(\.gz)?$")


def _pg_env():
    db = settings.DATABASES["default"]
    env = os.environ.copy()
    env["PGPASSWORD"] = db["PASSWORD"]
    return env, db


def _ensure_dir():
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)


class DbStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        started = time.perf_counter()
        try:
            with connection.cursor() as cur:
                cur.execute("SELECT version(), current_database(), pg_database_size(current_database())")
                version, dbname, size = cur.fetchone()
            elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
            return Response({
                "connected": True,
                "database": dbname,
                "server_version": version,
                "size_bytes": int(size),
                "latency_ms": elapsed_ms,
            })
        except Exception as exc:
            return Response({"connected": False, "error": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class DbBackupListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _ensure_dir()
        files = []
        for p in sorted(BACKUPS_DIR.glob("*.sql*"), reverse=True):
            st = p.stat()
            files.append({
                "filename": p.name,
                "size_bytes": st.st_size,
                "created_at": datetime.fromtimestamp(st.st_mtime).isoformat(),
            })
        return Response({"backups": files})


class DbBackupCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        _ensure_dir()
        env, db = _pg_env()
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"stock_{stamp}.sql.gz"
        out_path = BACKUPS_DIR / filename

        log_lines = [f"[{datetime.now().isoformat(timespec='seconds')}] Starting backup -> {filename}"]
        cmd = [
            "pg_dump",
            "-h", db["HOST"],
            "-p", str(db["PORT"]),
            "-U", db["USER"],
            "-d", db["NAME"],
            "--clean", "--if-exists",
        ]
        log_lines.append("$ " + " ".join(cmd) + " | gzip > " + str(out_path))

        started = time.perf_counter()
        try:
            with open(out_path, "wb") as f:
                dump = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
                gzip_p = subprocess.Popen(["gzip"], stdin=dump.stdout, stdout=f, stderr=subprocess.PIPE)
                dump.stdout.close()
                _, dump_err = dump.communicate()
                _, gz_err = gzip_p.communicate()
            rc = dump.returncode or gzip_p.returncode
            if dump_err:
                log_lines.append(dump_err.decode(errors="replace").strip())
            if gz_err:
                log_lines.append(gz_err.decode(errors="replace").strip())
            if rc != 0:
                try:
                    out_path.unlink(missing_ok=True)
                except Exception:
                    pass
                log_lines.append(f"FAILED (exit {rc})")
                return Response({"ok": False, "log": "\n".join(log_lines)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            elapsed = round(time.perf_counter() - started, 2)
            size = out_path.stat().st_size
            log_lines.append(f"Done in {elapsed}s  ({size} bytes)")
            return Response({
                "ok": True,
                "filename": filename,
                "size_bytes": size,
                "log": "\n".join(log_lines),
            })
        except Exception as exc:
            log_lines.append(f"EXCEPTION: {exc}")
            return Response({"ok": False, "log": "\n".join(log_lines)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DbBackupDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, filename):
        if not SAFE_NAME.match(filename):
            raise Http404
        path = BACKUPS_DIR / filename
        if not path.exists():
            raise Http404
        return FileResponse(open(path, "rb"), as_attachment=True, filename=filename)


class DbBackupDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, filename):
        if not SAFE_NAME.match(filename):
            raise Http404
        path = BACKUPS_DIR / filename
        if not path.exists():
            raise Http404
        path.unlink()
        return Response({"ok": True})


class DbRestoreView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        filename = request.data.get("filename")
        if not filename or not SAFE_NAME.match(filename):
            return Response({"ok": False, "log": "Invalid filename."}, status=status.HTTP_400_BAD_REQUEST)

        path = BACKUPS_DIR / filename
        if not path.exists():
            return Response({"ok": False, "log": f"File not found: {filename}"}, status=status.HTTP_404_NOT_FOUND)

        env, db = _pg_env()
        log_lines = [f"[{datetime.now().isoformat(timespec='seconds')}] Starting restore <- {filename}"]

        cat_cmd = ["gunzip", "-c", str(path)] if filename.endswith(".gz") else ["cat", str(path)]
        psql_cmd = [
            "psql",
            "-h", db["HOST"],
            "-p", str(db["PORT"]),
            "-U", db["USER"],
            "-d", db["NAME"],
            "-v", "ON_ERROR_STOP=1",
        ]
        log_lines.append("$ " + " ".join(cat_cmd) + " | " + " ".join(psql_cmd))

        started = time.perf_counter()
        try:
            src = subprocess.Popen(cat_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            dst = subprocess.Popen(psql_cmd, stdin=src.stdout, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            src.stdout.close()
            dst_out, dst_err = dst.communicate()
            _, src_err = src.communicate()

            if src_err:
                log_lines.append(src_err.decode(errors="replace").strip())
            if dst_out:
                tail = dst_out.decode(errors="replace").strip().splitlines()[-40:]
                log_lines.extend(tail)
            if dst_err:
                log_lines.append(dst_err.decode(errors="replace").strip())

            rc = dst.returncode
            elapsed = round(time.perf_counter() - started, 2)
            if rc != 0:
                log_lines.append(f"FAILED (exit {rc}) after {elapsed}s")
                return Response({"ok": False, "log": "\n".join(log_lines)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            log_lines.append(f"Done in {elapsed}s")
            return Response({"ok": True, "log": "\n".join(log_lines)})
        except Exception as exc:
            log_lines.append(f"EXCEPTION: {exc}")
            return Response({"ok": False, "log": "\n".join(log_lines)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
