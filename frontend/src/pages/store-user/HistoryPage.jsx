import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button, Stack, Chip, IconButton, Tooltip, Alert, Box, Typography, CircularProgress } from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, ConfirmDialog } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { getUploadHistory, deleteUpload, getDeletionPreview } from "../../api/uploads";
import { useOutlet } from "../../contexts/OutletContext";

export default function HistoryPage() {
  const notify = useNotify();
  const { outletId } = useOutlet();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmLog, setConfirmLog] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLoading(true);
    getUploadHistory(outletId).then(({ data }) => setData(data)).finally(() => setLoading(false));
  }, [outletId]);

  const openConfirm = async (row) => {
    setConfirmLog(row);
    setPreview(null);
    setPreviewLoading(true);
    try {
      const { data } = await getDeletionPreview(row.id);
      setPreview(data);
    } catch (err) {
      notify.error(err.response?.data?.detail || "Could not load deletion preview.");
      setConfirmLog(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closeConfirm = () => {
    setConfirmLog(null);
    setPreview(null);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { data: report } = await deleteUpload(confirmLog.id);
      setData((p) => ({ ...p, logs: p.logs.filter((l) => l.id !== confirmLog.id) }));
      notify.success(
        `Rolled back ${confirmLog.snapshot_date}: ${report.items_deleted} items, ${report.snapshots_deleted} snapshots, ${report.pending_deleted} pending.`
      );
      closeConfirm();
    } catch (err) {
      notify.error(err.response?.data?.detail || "Delete failed.");
    } finally { setDeleting(false); }
  };

  const STATUS_COLOR = { success: "success", pending: "warning", deleted: "default", failed: "error" };
  const APPROVAL_LABEL = { pending: ["Pending approval", "warning"], approved: ["Approved", "success"], rejected: ["Rejected", "error"] };

  const columns = [
    { field: "snapshot_date", headerName: "Date", flex: 0.8, minWidth: 120 },
    { field: "filename", headerName: "File", flex: 1.4, minWidth: 180, valueGetter: (v) => v || "—" },
    { field: "total_rows", headerName: "Items", type: "number", flex: 0.5, minWidth: 80 },
    {
      field: "new_items_count", headerName: "New", type: "number", flex: 0.5, minWidth: 80,
      renderCell: (p) => p.value > 0 ? <Box sx={{ color: "warning.main", fontWeight: 600 }}>{p.value}</Box> : <Box sx={{ opacity: 0.5 }}>0</Box>,
    },
    {
      field: "changed_items_count", headerName: "Changed", type: "number", flex: 0.6, minWidth: 90,
      renderCell: (p) => (p.value ?? 0) > 0 ? <Box sx={{ color: "info.main", fontWeight: 600 }}>{p.value}</Box> : <Box sx={{ opacity: 0.5 }}>0</Box>,
    },
    {
      field: "status", headerName: "Status", flex: 0.9, minWidth: 160,
      renderCell: (p) => {
        const approval = APPROVAL_LABEL[p.row.approval_status];
        return (
          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            <Chip size="small" label={p.value} color={STATUS_COLOR[p.value] || "default"} variant="outlined" />
            {approval && <Chip size="small" label={approval[0]} color={approval[1]} variant="outlined" />}
          </Stack>
        );
      },
    },
    {
      field: "uploaded_at", headerName: "Uploaded", flex: 1, minWidth: 160,
      valueGetter: (v) => new Date(v).toLocaleString(),
    },
    {
      field: "actions", headerName: "", width: 60, sortable: false, filterable: false,
      renderCell: (p) => (p.row.status !== "deleted" && p.row.approval_status !== "pending") && (
        <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => openConfirm(p.row)}>
          <DeleteIcon fontSize="small" />
        </IconButton></Tooltip>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader
        title="Upload History"
        subtitle="All uploads for this outlet"
        icon={<HistoryIcon />}
        actions={<Button component={Link} to="/upload" variant="contained" startIcon={<AddIcon />}>New Upload</Button>}
      />

      {data?.missing_dates?.length > 0 && (
        <Alert severity="error" variant="outlined" sx={{ mb: 2 }}>
          <Box sx={{ fontWeight: 600, mb: 1 }}>Missing uploads detected:</Box>
          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            {data.missing_dates.map((d) => <Chip key={d} size="small" color="error" variant="outlined" label={d} />)}
          </Stack>
        </Alert>
      )}

      <DataTable rows={data?.logs ?? []} columns={columns} loading={loading} emptyText="No uploads yet" />

      <ConfirmDialog
        open={Boolean(confirmLog)}
        onClose={closeConfirm}
        onConfirm={handleDelete}
        loading={deleting}
        title={confirmLog ? `Roll back upload for ${confirmLog.snapshot_date}` : "Delete upload"}
        confirmLabel="Roll back"
        maxWidth="sm"
        disableConfirm={previewLoading || (preview && (!preview.can_delete || preview.already_deleted))}
        message={
          previewLoading ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 2 }}>
              <CircularProgress size={18} /> <Typography variant="body2">Calculating scope…</Typography>
            </Box>
          ) : preview?.already_deleted ? (
            <Alert severity="info">This upload has already been deleted.</Alert>
          ) : preview && !preview.can_delete ? (
            <Alert severity="error">
              Only an admin can delete uploads for <b>{preview.snapshot_date}</b> (not today's date).
            </Alert>
          ) : preview ? (
            <Box>
              <Typography variant="body2" sx={{ mb: 1.5 }}>
                This will permanently remove everything this upload introduced.
                {preview.requires_admin && <Box component="span" sx={{ color: "warning.main" }}> (admin action — past date)</Box>}
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 3, "& li": { py: 0.25 } }}>
                <li><b>{preview.scope.items}</b> new items created by this upload</li>
                <li><b>{preview.scope.pending_items}</b> pending review rows</li>
                <li><b>{preview.scope.barcodes}</b> barcodes attached to those items</li>
                <li><b>{preview.scope.snapshots_same_date}</b> POS snapshots for {preview.snapshot_date}</li>
              </Box>
              {preview.scope.sample_codes?.length > 0 && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">Sample item codes:</Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                    {preview.scope.sample_codes.slice(0, 10).map((c) => (
                      <Chip key={c} size="small" label={c} variant="outlined" />
                    ))}
                    {preview.scope.sample_codes.length > 10 && (
                      <Chip size="small" label={`+${preview.scope.sample_codes.length - 10}`} variant="outlined" />
                    )}
                  </Stack>
                </Box>
              )}
              <Alert severity="warning" sx={{ mt: 2 }}>This cannot be undone.</Alert>
            </Box>
          ) : ""
        }
      />
    </Layout>
  );
}
