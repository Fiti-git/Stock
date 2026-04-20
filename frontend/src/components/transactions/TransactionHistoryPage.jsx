import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Stack, Button, IconButton, Tooltip, Chip, Alert, Box, Typography,
  Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress,
  TextField, MenuItem, FormControlLabel, Switch,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import VisibilityIcon from "@mui/icons-material/Visibility";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import Layout from "../Layout";
import { PageHeader, DataTable, ConfirmDialog } from "../ui";
import { useAuth } from "../../contexts/AuthContext";
import { useNotify } from "../../providers/NotificationProvider";
import { getOutlets } from "../../api/outlets";

const APPROVAL_COLORS = {
  auto: "default",
  pending: "warning",
  approved: "success",
  rejected: "error",
};

/**
 * Shared history page for date-range transaction types. Driven by a `config`
 * prop that supplies the type label, icon, API bindings, upload path, and
 * optional `detailColumns` — an array of { header, field, format? } used to
 * render the row-detail dialog. If omitted, a default 10-column layout is
 * used (suits damage/office/verification).
 */
const DEFAULT_DETAIL_COLUMNS = [
  { header: "DOC",         field: "doc_no" },
  { header: "Date",        field: "txn_date" },
  { header: "Code",        field: "item_code" },
  { header: "Description", field: "description" },
  { header: "Cost",        field: "cost_price",    format: (v) => v ?? "—" },
  { header: "Sell",        field: "selling_price", format: (v) => v ?? "—" },
  { header: "Qty",         field: "qty" },
  { header: "Amount",      field: "amount",        format: (v) => Number(v).toLocaleString() },
  { header: "User",        field: "user_name" },
  { header: "Time",        field: "txn_time" },
];

export default function TransactionHistoryPage({ config, embedded = false }) {
  const { label, icon, api, uploadPath, detailColumns } = config;
  const cols = detailColumns || DEFAULT_DETAIL_COLUMNS;
  const { user } = useAuth();
  const notify = useNotify();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const [batches, setBatches] = useState([]);
  const [missingDates, setMissingDates] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [outletFilter, setOutletFilter] = useState("");
  const [approvalFilter, setApprovalFilter] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [loading, setLoading] = useState(true);

  // Server-side pagination. DataGrid uses 0-indexed pages; the backend uses
  // 1-indexed, so we +1 / -1 at the boundary.
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
  const [rowCount, setRowCount] = useState(0);

  const [viewing, setViewing] = useState(null);
  const [viewLines, setViewLines] = useState([]);
  const [viewCount, setViewCount] = useState(0);
  const [viewPage, setViewPage] = useState(1);
  const [viewPageSize] = useState(100);
  const [viewLoading, setViewLoading] = useState(false);

  const [deletePreview, setDeletePreview] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [{ data }, outletResp] = await Promise.all([
        api.listBatches({
          outletId: isAdmin ? outletFilter || undefined : undefined,
          approvalStatus: approvalFilter || undefined,
          includeDeleted,
          page: paginationModel.page + 1,
          pageSize: paginationModel.pageSize,
        }),
        isAdmin && outlets.length === 0 ? getOutlets() : Promise.resolve(null),
      ]);
      setBatches(data.batches || []);
      setRowCount(data.count ?? (data.batches?.length || 0));
      setMissingDates(data.missing_dates || []);
      if (outletResp) setOutlets(outletResp.data || []);
    } catch {
      notify.error(`Failed to load ${label.toLowerCase()} batches.`);
    } finally {
      setLoading(false);
    }
  }

  // Reset to the first page whenever a filter changes — otherwise you can get
  // stranded on page 3 of a result set that now only has 1 page.
  useEffect(() => {
    setPaginationModel((m) => ({ ...m, page: 0 }));
  }, [outletFilter, approvalFilter, includeDeleted]);

  useEffect(() => { load(); }, [outletFilter, approvalFilter, includeDeleted, paginationModel]); // eslint-disable-line

  async function loadDetailPage(batch, page) {
    setViewLoading(true);
    try {
      const { data } = await api.getBatchDetail(batch.id, { page, pageSize: viewPageSize });
      setViewLines(data.lines || []);
      setViewCount(data.count ?? (data.lines?.length || 0));
      setViewPage(data.page ?? page);
    } catch {
      notify.error("Failed to load batch detail.");
    } finally {
      setViewLoading(false);
    }
  }

  async function openDetail(batch) {
    setViewing(batch);
    setViewLines([]);
    setViewPage(1);
    setViewCount(0);
    await loadDetailPage(batch, 1);
  }

  async function openDelete(batch) {
    try {
      const { data } = await api.getDeletionPreview(batch.id);
      setDeletePreview(data);
    } catch {
      notify.error("Failed to load deletion preview.");
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await api.deleteBatch(deletePreview.batch.id);
      notify.success(`Batch #${deletePreview.batch.id} deleted.`);
      setDeletePreview(null);
      load();
    } catch (err) {
      notify.error(err.response?.data?.detail || "Delete failed.");
    } finally {
      setDeleting(false);
    }
  }

  async function approve(batch) {
    try {
      await api.approveBatch(batch.id);
      notify.success(`Batch #${batch.id} approved.`);
      load();
    } catch (err) {
      notify.error(err.response?.data?.detail || "Approval failed.");
    }
  }

  async function reject(batch) {
    try {
      await api.rejectBatch(batch.id);
      notify.success(`Batch #${batch.id} rejected.`);
      load();
    } catch (err) {
      notify.error(err.response?.data?.detail || "Reject failed.");
    }
  }

  const columns = useMemo(() => [
    { field: "id", headerName: "#", width: 70 },
    { field: "outlet_name", headerName: "Outlet", flex: 1, minWidth: 140 },
    { field: "date_from", headerName: "From", width: 110 },
    { field: "date_to", headerName: "To", width: 110 },
    { field: "total_rows", headerName: "Rows", width: 80, type: "number" },
    {
      field: "total_amount", headerName: "Amount", width: 120, type: "number",
      valueGetter: (v) => v,
      renderCell: (p) => `LKR ${Number(p.value || 0).toLocaleString()}`,
    },
    { field: "uploaded_by", headerName: "By", width: 120 },
    {
      field: "uploaded_at", headerName: "Uploaded", width: 160,
      valueGetter: (v) => v, renderCell: (p) => new Date(p.value).toLocaleString(),
    },
    {
      field: "approval_status", headerName: "Approval", width: 120,
      renderCell: (p) => (
        <Chip
          size="small"
          label={p.value}
          color={APPROVAL_COLORS[p.value] || "default"}
          variant={p.value === "auto" ? "outlined" : "filled"}
        />
      ),
    },
    {
      field: "actions", headerName: "", width: 170, sortable: false, filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.25}>
          <Tooltip title="View rows">
            <IconButton size="small" onClick={() => openDetail(p.row)}>
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {isAdmin && p.row.approval_status === "pending" && (
            <>
              <Tooltip title="Approve">
                <IconButton size="small" color="success" onClick={() => approve(p.row)}>
                  <CheckIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Reject">
                <IconButton size="small" color="error" onClick={() => reject(p.row)}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
          {p.row.status === "success" && (
            <Tooltip title="Delete batch">
              <IconButton size="small" color="error" onClick={() => openDelete(p.row)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ], [isAdmin]); // eslint-disable-line

  const body = (
    <>
      {!embedded && (
        <PageHeader
          title={`${label} History`}
          subtitle={`Review, approve, and delete ${label.toLowerCase()} upload batches`}
          icon={icon}
          actions={
            <Button variant="contained" component={Link} to={uploadPath}>
              New Upload
            </Button>
          }
        />
      )}

      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
        {isAdmin && (
          <TextField
            select size="small" label="Outlet" value={outletFilter}
            onChange={(e) => setOutletFilter(e.target.value)} sx={{ minWidth: 200 }}
          >
            <MenuItem value="">All outlets</MenuItem>
            {outlets.map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          select size="small" label="Approval" value={approvalFilter}
          onChange={(e) => setApprovalFilter(e.target.value)} sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="auto">Auto (same-day)</MenuItem>
          <MenuItem value="pending">Pending</MenuItem>
          <MenuItem value="approved">Approved</MenuItem>
          <MenuItem value="rejected">Rejected</MenuItem>
        </TextField>
        <FormControlLabel
          control={
            <Switch size="small" checked={includeDeleted}
              onChange={(e) => setIncludeDeleted(e.target.checked)} />
          }
          label="Show deleted (audit)"
        />
      </Stack>

      {missingDates.length > 0 && (
        <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <b>Possible gaps (last 60 days, excluding Sundays):</b> no {label.toLowerCase()} batch
            covers {missingDates.length} date{missingDates.length === 1 ? "" : "s"} —{" "}
            {missingDates.slice(-10).join(", ")}
            {missingDates.length > 10 ? " …" : ""}
          </Typography>
        </Alert>
      )}

      <DataTable
        rows={batches}
        columns={columns}
        loading={loading}
        emptyText={`No ${label.toLowerCase()} batches yet`}
        paginationMode="server"
        rowCount={rowCount}
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        pageSizeOptions={[10, 25, 50, 100]}
      />

      <Dialog open={!!viewing} onClose={() => setViewing(null)} maxWidth="lg" fullWidth>
        <DialogTitle>
          Batch #{viewing?.id} · {viewing?.outlet_name} · {viewing?.date_from} to{" "}
          {viewing?.date_to}
        </DialogTitle>
        <DialogContent dividers>
          {viewLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ overflowX: "auto" }}>
              <Box
                component="table"
                sx={{ fontSize: "0.8125rem", width: "100%", borderCollapse: "collapse" }}
              >
                <thead>
                  <tr style={{ textAlign: "left", background: "rgba(0,0,0,0.04)" }}>
                    {cols.map((c) => (
                      <th key={c.field} style={{ padding: "6px 10px" }}>{c.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {viewLines.map((l) => (
                    <tr key={l.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                      {cols.map((c) => {
                        const v = l[c.field];
                        return (
                          <td key={c.field} style={{ padding: "4px 10px" }}>
                            {c.format ? c.format(v) : (v ?? "")}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </Box>
              {viewLines.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", p: 3 }}>
                  No rows in this batch.
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: "space-between" }}>
          <Typography variant="caption" color="text.secondary">
            {viewCount > 0
              ? `Rows ${(viewPage - 1) * viewPageSize + 1}\u2013${Math.min(viewPage * viewPageSize, viewCount)} of ${viewCount.toLocaleString()}`
              : ""}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              disabled={viewLoading || viewPage <= 1}
              onClick={() => viewing && loadDetailPage(viewing, viewPage - 1)}
            >
              ← Prev
            </Button>
            <Button
              size="small"
              disabled={viewLoading || viewPage * viewPageSize >= viewCount}
              onClick={() => viewing && loadDetailPage(viewing, viewPage + 1)}
            >
              Next →
            </Button>
            <Button onClick={() => setViewing(null)}>Close</Button>
          </Stack>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deletePreview}
        onClose={() => setDeletePreview(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title={deletePreview ? `Delete batch #${deletePreview.batch.id}?` : ""}
        message={
          deletePreview
            ? `This removes ${deletePreview.row_count} rows covering ${deletePreview.batch.date_from} to ${deletePreview.batch.date_to} (LKR ${Number(deletePreview.total_amount).toLocaleString()}). ${deletePreview.can_delete ? "This cannot be undone." : "You do not have permission — admin required."}`
            : ""
        }
        confirmLabel="Delete"
      />
    </>
  );

  return embedded ? body : <Layout>{body}</Layout>;
}
