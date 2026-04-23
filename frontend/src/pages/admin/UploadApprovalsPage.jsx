import { useState, useEffect } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Grid, Card, CardContent,
  Button, Stack, Chip, IconButton, Typography, Box, CircularProgress, Alert,
} from "@mui/material";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import CloseIcon from "@mui/icons-material/Close";
import VisibilityIcon from "@mui/icons-material/Visibility";
import FiberNewIcon from "@mui/icons-material/FiberNew";
import CheckIcon from "@mui/icons-material/Check";
import BlockIcon from "@mui/icons-material/Block";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, EmptyState } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { getPendingApprovals, approveUpload, rejectUpload, getUploadDiff } from "../../api/uploads";

function DiffDialog({ log, onClose, onApprove, onReject, processing }) {
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    getUploadDiff(log.id)
      .then(({ data }) => setDiff(data))
      .catch(() => setError("Could not load preview."))
      .finally(() => setLoading(false));
  }, [log.id]);

  const isProcessing = processing && processing.startsWith(String(log.id));

  const newItemCols = [
    { field: "item_code", headerName: "Code", flex: 0.8, minWidth: 110 },
    { field: "item_name", headerName: "Name", flex: 1.6, minWidth: 180 },
    { field: "cost_price", headerName: "Cost", flex: 0.5, minWidth: 80, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { field: "selling_price", headerName: "Sell", flex: 0.5, minWidth: 80, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { field: "pos_quantity", headerName: "Qty", flex: 0.5, minWidth: 70, valueGetter: (v) => v != null ? Number(v).toFixed(0) : "—" },
  ];
  const susCols = [
    { field: "item_code", headerName: "Code", flex: 0.8, minWidth: 110 },
    { field: "item_name", headerName: "Name", flex: 1.6, minWidth: 180 },
    { field: "old_selling_price", headerName: "Old Sell", flex: 0.6, minWidth: 90, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { field: "new_selling_price", headerName: "New Sell", flex: 0.6, minWidth: 90, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { field: "pct_change", headerName: "Change %", flex: 0.6, minWidth: 90, renderCell: (p) => <Chip size="small" color="error" label={`${p.value}%`} /> },
  ];

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Typography variant="h4">Upload Preview</Typography>
          <Typography variant="caption" color="text.secondary">
            {log.outlet_name} · <b>{log.snapshot_date}</b> · {log.filename}
          </Typography>
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading && <Box sx={{ display: "grid", placeItems: "center", py: 6 }}><CircularProgress /></Box>}
        {error && <Alert severity="error">{error}</Alert>}
        {diff && (
          <>
            <Grid container spacing={1.5} sx={{ mb: 3 }}>
              {[
                { label: "Total Rows", value: diff.summary.total, color: "default" },
                { label: "Matched", value: diff.summary.matched, color: "success" },
                { label: "New Items", value: diff.summary.new_items, color: "warning" },
                { label: "Suspicious", value: diff.summary.suspicious, color: diff.summary.suspicious > 0 ? "error" : "default" },
              ].map((c) => (
                <Grid key={c.label} item xs={6} md={3}>
                  <Card variant="outlined" sx={{ textAlign: "center", p: 1.5 }}>
                    <Typography variant="h2" color={c.color !== "default" ? `${c.color}.main` : "text.primary"}>{c.value}</Typography>
                    <Typography variant="caption" color="text.secondary">{c.label}</Typography>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {diff.suspicious_items.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="error" gutterBottom>⚠ Suspicious Price Changes ({diff.suspicious_items.length})</Typography>
                <DataTable rows={diff.suspicious_items} columns={susCols} getRowId={(r) => r.item_code} toolbar={false} height={260} initialPageSize={10} />
              </Box>
            )}
            {diff.new_items.length > 0 && (
              <Box>
                <Typography variant="subtitle2" color="warning.main" gutterBottom>New Items ({diff.new_items.length})</Typography>
                <DataTable rows={diff.new_items} columns={newItemCols} getRowId={(r) => r.item_code} toolbar={false} height={260} initialPageSize={10} />
              </Box>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} color="inherit">Close</Button>
        <Button onClick={() => onReject(log.id)} disabled={isProcessing} color="error" variant="outlined" startIcon={<BlockIcon />}>
          {processing === log.id + "reject" ? "Rejecting…" : "Reject"}
        </Button>
        <Button onClick={() => onApprove(log.id)} disabled={isProcessing} color="success" variant="contained" startIcon={<CheckIcon />}>
          {processing === log.id + "approve" ? "Approving…" : "Approve"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function NewItemsDialog({ log, onClose }) {
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    getUploadDiff(log.id)
      .then(({ data }) => setDiff(data))
      .catch(() => setError("Could not load new items."))
      .finally(() => setLoading(false));
  }, [log.id]);

  const columns = [
    { field: "item_code", headerName: "Code", flex: 0.8, minWidth: 110 },
    { field: "item_name", headerName: "Name", flex: 1.8, minWidth: 200 },
    { field: "cost_price", headerName: "Cost", flex: 0.5, minWidth: 90, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { field: "selling_price", headerName: "Sell", flex: 0.5, minWidth: 90, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { field: "pos_quantity", headerName: "Qty", flex: 0.5, minWidth: 80, valueGetter: (v) => v != null ? Number(v).toFixed(0) : "—" },
  ];

  const rows = diff?.new_items ?? [];

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Typography variant="h4">New Items ({rows.length})</Typography>
          <Typography variant="caption" color="text.secondary">
            {log.outlet_name} · <b>{log.snapshot_date}</b> · {log.filename}
          </Typography>
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading && <Box sx={{ display: "grid", placeItems: "center", py: 6 }}><CircularProgress /></Box>}
        {error && <Alert severity="error">{error}</Alert>}
        {diff && (
          rows.length === 0 ? (
            <EmptyState title="No new items" description="This upload contains no new products." />
          ) : (
            <DataTable
              rows={rows}
              columns={columns}
              getRowId={(r) => r.item_code}
              height={560}
              initialPageSize={25}
              pageSizeOptions={[25, 50, 100]}
            />
          )
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function UploadApprovalsPage() {
  const notify = useNotify();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [previewLog, setPreviewLog] = useState(null);
  const [newItemsLog, setNewItemsLog] = useState(null);

  const load = () => {
    setLoading(true);
    getPendingApprovals().then(({ data }) => setLogs(data)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handle = async (logId, action) => {
    setProcessing(logId + action);
    try {
      if (action === "approve") {
        const { data } = await approveUpload(logId);
        notify.success(`Approved: ${data.total_rows ?? ""} rows imported.`);
      } else {
        await rejectUpload(logId);
        notify.success("Upload rejected and discarded.");
      }
      setLogs((prev) => prev.filter((l) => l.id !== logId));
      setPreviewLog(null);
    } catch (err) {
      notify.error(err.response?.data?.detail || "Action failed.");
    } finally { setProcessing(null); }
  };

  const columns = [
    { field: "outlet_name", headerName: "Outlet", flex: 1, minWidth: 140 },
    { field: "snapshot_date", headerName: "XLS Date", flex: 0.8, minWidth: 120 },
    { field: "uploaded_by_username", headerName: "Uploaded By", flex: 0.9, minWidth: 130 },
    {
      field: "uploaded_at", headerName: "Submitted", flex: 1, minWidth: 160,
      valueGetter: (v) => new Date(v).toLocaleString(),
    },
    {
      field: "breakdown", headerName: "Breakdown", flex: 1.6, minWidth: 260, sortable: false, filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5} flexWrap="wrap">
          <Chip size="small" label={`${p.row.total_rows} rows`} variant="outlined" />
          {p.row.matched_rows > 0 && <Chip size="small" label={`${p.row.matched_rows} matched`} color="success" variant="outlined" />}
          {p.row.new_items_count > 0 && <Chip size="small" label={`${p.row.new_items_count} new`} color="warning" variant="outlined" />}
          {p.row.changed_items_count > 0 && <Chip size="small" label={`${p.row.changed_items_count} changed`} color="info" variant="outlined" />}
        </Stack>
      ),
    },
    {
      field: "actions", headerName: "", width: 260, sortable: false, filterable: false,
      renderCell: (p) => {
        const isP = processing && processing.startsWith(String(p.row.id));
        const hasNew = (p.row.new_items_count ?? 0) > 0;
        return (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Button size="small" startIcon={<VisibilityIcon />} onClick={() => setPreviewLog(p.row)}>Preview</Button>
            <IconButton
              size="small"
              color="warning"
              title={hasNew ? `View ${p.row.new_items_count} new items` : "No new items"}
              disabled={!hasNew}
              onClick={() => setNewItemsLog(p.row)}
            >
              <FiberNewIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" color="success" onClick={() => handle(p.row.id, "approve")} disabled={isP}><CheckIcon fontSize="small" /></IconButton>
            <IconButton size="small" color="error" onClick={() => handle(p.row.id, "reject")} disabled={isP}><BlockIcon fontSize="small" /></IconButton>
          </Stack>
        );
      },
    },
  ];

  return (
    <Layout>
      <PageHeader
        title="Upload Approvals"
        subtitle="Past-date uploads waiting for admin approval before data is committed"
        icon={<AssignmentTurnedInIcon />}
      />

      {!loading && logs.length === 0 ? (
        <Card variant="outlined"><CardContent><EmptyState title="No pending approvals" description="You're all caught up!" /></CardContent></Card>
      ) : (
        <DataTable rows={logs} columns={columns} loading={loading} emptyText="No pending approvals" />
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2, textAlign: "center" }}>
        Use Preview to inspect the upload before approving. Approving processes the stored XLS and commits snapshots. Rejecting discards the file permanently.
      </Typography>

      {previewLog && (
        <DiffDialog
          log={previewLog}
          onClose={() => setPreviewLog(null)}
          onApprove={(id) => handle(id, "approve")}
          onReject={(id) => handle(id, "reject")}
          processing={processing}
        />
      )}

      {newItemsLog && (
        <NewItemsDialog log={newItemsLog} onClose={() => setNewItemsLog(null)} />
      )}
    </Layout>
  );
}
