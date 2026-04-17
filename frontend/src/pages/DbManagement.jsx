import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import Alert from "../components/Alert";
import {
  createBackup,
  deleteBackup,
  downloadBackupUrl,
  getDbStatus,
  listBackups,
  restoreBackup,
} from "../api/dbops";

function formatBytes(n) {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function LogBox({ lines }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);
  return (
    <pre
      ref={ref}
      className="bg-gray-900 text-green-200 text-xs font-mono rounded-lg p-3 h-56 overflow-auto whitespace-pre-wrap"
    >
      {lines.length ? lines.join("\n") : "(no activity yet)"}
    </pre>
  );
}

export default function DbManagement() {
  const [status, setStatus] = useState({ loading: true });
  const [backups, setBackups] = useState([]);
  const [backupLog, setBackupLog] = useState([]);
  const [restoreLog, setRestoreLog] = useState([]);
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [feedback, setFeedback] = useState(null);

  function flash(type, message) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }

  async function refreshStatus() {
    setStatus({ loading: true });
    try {
      const { data } = await getDbStatus();
      setStatus({ loading: false, ...data });
    } catch (err) {
      setStatus({
        loading: false,
        connected: false,
        error: err.response?.data?.error || err.message || "Unable to reach the database.",
      });
    }
  }

  async function refreshBackups() {
    try {
      const { data } = await listBackups();
      setBackups(data.backups || []);
    } catch {
      setBackups([]);
    }
  }

  useEffect(() => {
    refreshStatus();
    refreshBackups();
  }, []);

  async function handleBackup() {
    setBacking(true);
    setBackupLog((l) => [...l, `[${new Date().toLocaleTimeString()}] Backup requested…`]);
    try {
      const { data } = await createBackup();
      setBackupLog((l) => [...l, data.log || "Backup complete."]);
      flash("success", `Backup created: ${data.filename}`);
      refreshBackups();
    } catch (err) {
      const log = err.response?.data?.log || err.message || "Backup failed.";
      setBackupLog((l) => [...l, log]);
      flash("error", "Backup failed. See log.");
    } finally {
      setBacking(false);
    }
  }

  async function handleRestore(filename) {
    setConfirm(null);
    setRestoring(true);
    setRestoreLog((l) => [...l, `[${new Date().toLocaleTimeString()}] Restoring ${filename}…`]);
    try {
      const { data } = await restoreBackup(filename);
      setRestoreLog((l) => [...l, data.log || "Restore complete."]);
      flash("success", "Restore complete.");
      refreshStatus();
    } catch (err) {
      const log = err.response?.data?.log || err.message || "Restore failed.";
      setRestoreLog((l) => [...l, log]);
      flash("error", "Restore failed. See log.");
    } finally {
      setRestoring(false);
    }
  }

  async function handleDelete(filename) {
    try {
      await deleteBackup(filename);
      flash("success", `Deleted ${filename}`);
      refreshBackups();
    } catch {
      flash("error", "Failed to delete backup file.");
    }
  }

  const connected = status.connected;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Database Management</h1>
          <p className="text-sm text-gray-500">
            View connection status, create backups, and restore the database from a previous dump.
          </p>
        </div>

        {feedback && <Alert type={feedback.type} message={feedback.message} />}

        {/* Status */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Connection Status</h2>
            <button
              onClick={refreshStatus}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
          {status.loading ? (
            <p className="text-sm text-gray-500">Checking…</p>
          ) : (
            <div className="flex items-start gap-3">
              <span
                className={`inline-flex h-3 w-3 rounded-full mt-1.5 ${
                  connected ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <div className="flex-1 text-sm">
                <div className={`font-medium ${connected ? "text-green-700" : "text-red-700"}`}>
                  {connected ? "Connected" : "Disconnected"}
                </div>
                {connected ? (
                  <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-6 text-gray-600">
                    <div><dt className="inline text-gray-400">Database: </dt><dd className="inline">{status.database}</dd></div>
                    <div><dt className="inline text-gray-400">Size: </dt><dd className="inline">{formatBytes(status.size_bytes)}</dd></div>
                    <div><dt className="inline text-gray-400">Latency: </dt><dd className="inline">{status.latency_ms} ms</dd></div>
                    <div className="sm:col-span-2 truncate"><dt className="inline text-gray-400">Server: </dt><dd className="inline">{status.server_version}</dd></div>
                  </dl>
                ) : (
                  <p className="mt-1 text-gray-600">{status.error}</p>
                )}
              </div>
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Backup */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Backup</h2>
              <button
                onClick={handleBackup}
                disabled={backing || !connected}
                className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700 disabled:opacity-50"
              >
                {backing ? "Backing up…" : "Create Backup"}
              </button>
            </div>
            <LogBox lines={backupLog} />
          </section>

          {/* Restore */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Restore</h2>
              <span className="text-xs text-gray-400">Overwrites current data</span>
            </div>
            <LogBox lines={restoreLog} />
          </section>
        </div>

        {/* Backup list */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Available Backups</h2>
            <button
              onClick={refreshBackups}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>

          {backups.length === 0 ? (
            <p className="text-sm text-gray-500">No backups yet. Click "Create Backup" to make one.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 text-left border-b border-gray-100">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Filename</th>
                    <th className="py-2 pr-4 font-medium">Size</th>
                    <th className="py-2 pr-4 font-medium">Created</th>
                    <th className="py-2 pr-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b) => (
                    <tr key={b.filename} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs text-gray-700">{b.filename}</td>
                      <td className="py-2 pr-4 text-gray-600">{formatBytes(b.size_bytes)}</td>
                      <td className="py-2 pr-4 text-gray-600">{fmtDate(b.created_at)}</td>
                      <td className="py-2 pr-4 text-right space-x-2 whitespace-nowrap">
                        <a
                          href={downloadBackupUrl(b.filename)}
                          className="inline-block px-2.5 py-1 rounded border border-gray-200 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          Download
                        </a>
                        <button
                          onClick={() => setConfirm({ action: "restore", filename: b.filename })}
                          disabled={restoring}
                          className="px-2.5 py-1 rounded bg-amber-500 text-white text-xs hover:bg-amber-600 disabled:opacity-50"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => setConfirm({ action: "delete", filename: b.filename })}
                          className="px-2.5 py-1 rounded bg-red-500 text-white text-xs hover:bg-red-600"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Confirm dialog */}
      {confirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              {confirm.action === "restore" ? "Restore database?" : "Delete backup?"}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {confirm.action === "restore"
                ? "This will OVERWRITE the current database with the selected backup. This cannot be undone."
                : "The backup file will be permanently removed."}
              <br />
              <span className="font-mono text-xs text-gray-500">{confirm.filename}</span>
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirm(null)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  confirm.action === "restore"
                    ? handleRestore(confirm.filename)
                    : handleDelete(confirm.filename) || setConfirm(null)
                }
                className={`px-4 py-2 rounded-lg text-white text-sm ${
                  confirm.action === "restore"
                    ? "bg-amber-500 hover:bg-amber-600"
                    : "bg-red-500 hover:bg-red-600"
                }`}
              >
                {confirm.action === "restore" ? "Yes, Restore" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
