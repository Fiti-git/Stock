import { useEffect, useRef, useState } from "react";
import {
  Box, Card, CardContent, Typography, Button, Stack, Grid, Chip, Alert, IconButton, Tooltip,
} from "@mui/material";
import StorageIcon from "@mui/icons-material/Storage";
import RefreshIcon from "@mui/icons-material/Refresh";
import BackupIcon from "@mui/icons-material/Backup";
import UploadIcon from "@mui/icons-material/Upload";
import DownloadIcon from "@mui/icons-material/Download";
import RestoreIcon from "@mui/icons-material/Restore";
import DeleteIcon from "@mui/icons-material/Delete";
import Layout from "../components/Layout";
import { PageHeader, DataTable, ConfirmDialog } from "../components/ui";
import { useNotify } from "../providers/NotificationProvider";
import {
  createBackup, deleteBackup, downloadBackup, getDbStatus, listBackups, restoreBackup, uploadBackup,
} from "../api/dbops";

function formatBytes(n) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function LogBox({ lines }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [lines]);
  return (
    <Box ref={ref} component="pre" sx={{
      bgcolor: "#0b1220", color: "#a6f4a6", fontSize: "0.72rem",
      fontFamily: "ui-monospace, monospace", borderRadius: 1, p: 1.5, height: 220,
      overflow: "auto", whiteSpace: "pre-wrap", m: 0,
    }}>
      {lines.length ? lines.join("\n") : "(no activity yet)"}
    </Box>
  );
}

export default function DbManagement() {
  const notify = useNotify();
  const [status, setStatus] = useState({ loading: true });
  const [backups, setBackups] = useState([]);
  const [backupLog, setBackupLog] = useState([]);
  const [restoreLog, setRestoreLog] = useState([]);
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const fileInputRef = useRef(null);

  async function refreshStatus() {
    setStatus({ loading: true });
    try { const { data } = await getDbStatus(); setStatus({ loading: false, ...data }); }
    catch (err) { setStatus({ loading: false, connected: false, error: err.response?.data?.error || err.message || "Unable to reach database." }); }
  }
  async function refreshBackups() {
    try { const { data } = await listBackups(); setBackups(data.backups || []); } catch { setBackups([]); }
  }
  useEffect(() => { refreshStatus(); refreshBackups(); }, []);

  async function handleBackup() {
    setBacking(true);
    setBackupLog((l) => [...l, `[${new Date().toLocaleTimeString()}] Backup requested…`]);
    try {
      const { data } = await createBackup();
      setBackupLog((l) => [...l, data.log || "Backup complete."]);
      notify.success(`Backup created: ${data.filename}`);
      refreshBackups();
    } catch (err) {
      setBackupLog((l) => [...l, err.response?.data?.log || err.message || "Backup failed."]);
      notify.error("Backup failed.");
    } finally { setBacking(false); }
  }

  async function handleRestore(filename) {
    setConfirm(null); setRestoring(true);
    setRestoreLog((l) => [...l, `[${new Date().toLocaleTimeString()}] Restoring ${filename}…`]);
    try {
      const { data } = await restoreBackup(filename);
      setRestoreLog((l) => [...l, data.log || "Restore complete."]);
      notify.success("Restore complete.");
      refreshStatus();
    } catch (err) {
      setRestoreLog((l) => [...l, err.response?.data?.log || err.message || "Restore failed."]);
      notify.error("Restore failed.");
    } finally { setRestoring(false); }
  }

  async function handleDownload(filename) {
    try {
      const res = await downloadBackup(filename);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { notify.error("Download failed."); }
  }

  async function handleUpload(file) {
    if (!file) return;
    if (!/\.sql(\.gz)?$/i.test(file.name)) { notify.error("File must end in .sql or .sql.gz"); return; }
    setUploading(true);
    try { const { data } = await uploadBackup(file); notify.success(`Uploaded: ${data.filename}`); refreshBackups(); }
    catch (err) { notify.error(err.response?.data?.error || "Upload failed."); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }

  async function handleDelete(filename) {
    setConfirm(null);
    try { await deleteBackup(filename); notify.success(`Deleted ${filename}`); refreshBackups(); }
    catch { notify.error("Failed to delete backup."); }
  }

  const connected = status.connected;

  const columns = [
    { field: "filename", headerName: "Filename", flex: 1.6, minWidth: 200 },
    { field: "size_bytes", headerName: "Size", flex: 0.6, minWidth: 90, valueGetter: (v) => formatBytes(v) },
    { field: "created_at", headerName: "Created", flex: 1, minWidth: 160, valueGetter: (v) => new Date(v).toLocaleString() },
    {
      field: "actions", headerName: "Actions", width: 160, sortable: false, filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Download"><IconButton size="small" onClick={() => handleDownload(p.row.filename)}><DownloadIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Restore"><IconButton size="small" color="warning" disabled={restoring} onClick={() => setConfirm({ action: "restore", filename: p.row.filename })}><RestoreIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setConfirm({ action: "delete", filename: p.row.filename })}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader title="Database Management" subtitle="View connection status, create backups, and restore from a previous dump." icon={<StorageIcon />} />

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h4">Connection Status</Typography>
            <Button size="small" startIcon={<RefreshIcon />} onClick={refreshStatus}>Refresh</Button>
          </Stack>
          {status.loading ? <Typography variant="body2" color="text.secondary">Checking…</Typography> : (
            <Stack direction="row" spacing={2} alignItems="flex-start">
              <Chip label={connected ? "Connected" : "Disconnected"} color={connected ? "success" : "error"} size="small" />
              <Box sx={{ flex: 1 }}>
                {connected ? (
                  <Grid container spacing={1}>
                    <Grid item xs={6} md={3}><Typography variant="caption" color="text.secondary">Database</Typography><Typography variant="body2">{status.database}</Typography></Grid>
                    <Grid item xs={6} md={3}><Typography variant="caption" color="text.secondary">Size</Typography><Typography variant="body2">{formatBytes(status.size_bytes)}</Typography></Grid>
                    <Grid item xs={6} md={3}><Typography variant="caption" color="text.secondary">Latency</Typography><Typography variant="body2">{status.latency_ms} ms</Typography></Grid>
                    <Grid item xs={12} md={12}><Typography variant="caption" color="text.secondary">Server</Typography><Typography variant="body2" noWrap>{status.server_version}</Typography></Grid>
                  </Grid>
                ) : <Typography variant="body2" color="error">{status.error}</Typography>}
              </Box>
            </Stack>
          )}
        </CardContent>
      </Card>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h4">Backup</Typography>
                <Button variant="contained" startIcon={<BackupIcon />} disabled={backing || !connected} onClick={handleBackup}>
                  {backing ? "Backing up…" : "Create Backup"}
                </Button>
              </Stack>
              <LogBox lines={backupLog} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h4">Restore</Typography>
                <Typography variant="caption" color="warning.main">Overwrites current data</Typography>
              </Stack>
              <LogBox lines={restoreLog} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card variant="outlined">
        <CardContent sx={{ pb: 1 }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1}>
            <Typography variant="h4">Available Backups</Typography>
            <Stack direction="row" spacing={1}>
              <input ref={fileInputRef} type="file" accept=".sql,.gz,.sql.gz" hidden onChange={(e) => handleUpload(e.target.files?.[0])} />
              <Button size="small" variant="contained" startIcon={<UploadIcon />} disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? "Uploading…" : "Upload"}
              </Button>
              <Button size="small" startIcon={<RefreshIcon />} onClick={refreshBackups}>Refresh</Button>
            </Stack>
          </Stack>
        </CardContent>
        <Box sx={{ px: 2, pb: 2 }}>
          <DataTable rows={backups} columns={columns} getRowId={(r) => r.filename} toolbar={false} height={420} initialPageSize={10} emptyText="No backups yet" />
        </Box>
      </Card>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm?.action === "restore" ? handleRestore(confirm.filename) : handleDelete(confirm.filename)}
        loading={restoring}
        title={confirm?.action === "restore" ? "Restore database?" : "Delete backup?"}
        color={confirm?.action === "restore" ? "warning" : "error"}
        confirmLabel={confirm?.action === "restore" ? "Yes, Restore" : "Yes, Delete"}
        message={
          <>
            {confirm?.action === "restore"
              ? "This will OVERWRITE the current database with the selected backup. This cannot be undone."
              : "The backup file will be permanently removed."}
            <Box component="code" sx={{ display: "block", mt: 1, fontFamily: "monospace", fontSize: "0.75rem", opacity: 0.7 }}>{confirm?.filename}</Box>
          </>
        }
      />
    </Layout>
  );
}
