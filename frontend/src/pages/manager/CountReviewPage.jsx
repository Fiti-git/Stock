import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, Typography, Chip, Alert, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, Tooltip,
} from "@mui/material";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import {
  getDailyCounts, approveCount, rejectCount, bulkApproveCounts,
} from "../../api/dashboard";
import { useOutlet } from "../../contexts/OutletContext";
import { useNotification } from "../../providers/NotificationProvider";

const STATUS_COLORS = {
  draft: "default",
  submitted: "warning",
  approved: "success",
  rejected: "error",
};

export default function CountReviewPage() {
  const { outletId } = useOutlet();
  const { notify } = useNotification();
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("submitted");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState({ type: "include", ids: new Set() });
  const selectionIds = Array.from(selection.ids);
  const selectionCount = selection.ids.size;
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const PAGE_SIZE = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDailyCounts({
        outletId, dateFrom, dateTo, search,
        approvalStatus: status || undefined,
        page, pageSize: PAGE_SIZE,
      });
      setData(res.data);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed to load counts.", "error");
    } finally {
      setLoading(false);
    }
  }, [outletId, dateFrom, dateTo, search, status, page, notify]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); setSelection({ type: "include", ids: new Set() }); }, [outletId, dateFrom, dateTo, search, status]);

  const handleApprove = async (id) => {
    try {
      await approveCount(id);
      notify("Count approved.", "success");
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Approval failed.", "error");
    }
  };

  const handleBulkApprove = async () => {
    if (!selectionCount) return;
    try {
      const res = await bulkApproveCounts(selectionIds);
      notify(`Approved ${res.data.count} count(s).`, "success");
      setSelection({ type: "include", ids: new Set() });
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Bulk approve failed.", "error");
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    try {
      await rejectCount(rejectTarget.id, rejectReason.trim());
      notify("Count rejected.", "success");
      setRejectTarget(null);
      setRejectReason("");
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Rejection failed.", "error");
    }
  };

  const splitLocVariant = (tag) => {
    if (!tag) return { loc: "", variant: "" };
    const idx = tag.indexOf("|");
    if (idx === -1) return { loc: tag, variant: "" };
    return { loc: tag.slice(0, idx), variant: tag.slice(idx + 1) };
  };

  const columns = [
    { field: "count_date", headerName: "Date", flex: 0.7, minWidth: 110 },
    { field: "item_code", headerName: "Item Code", flex: 0.8, minWidth: 110 },
    { field: "item_name", headerName: "Item Name", flex: 1.6, minWidth: 220 },
    {
      field: "location_tag", headerName: "Location", flex: 0.6, minWidth: 100,
      valueGetter: (v, row) => splitLocVariant(row.location_tag).loc,
      renderCell: (p) => p.value ? <Chip size="small" label={p.value} variant="outlined" /> : "—",
    },
    {
      field: "_variant", headerName: "Variant", flex: 0.6, minWidth: 100, sortable: false,
      valueGetter: (v, row) => splitLocVariant(row.location_tag).variant,
      renderCell: (p) => p.value ? <Chip size="small" label={p.value} color="info" variant="outlined" /> : "—",
    },
    {
      field: "actual_qty", headerName: "Qty", type: "number", flex: 0.5, minWidth: 80,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <span>{p.value}</span>
          {p.row.flagged_outlier && (
            <Tooltip title="Outlier (>10× POS qty) — review carefully">
              <WarningAmberIcon fontSize="small" color="warning" />
            </Tooltip>
          )}
        </Stack>
      ),
    },
    {
      field: "last_snapshot_qty", headerName: "Last Qty", type: "number", flex: 0.5, minWidth: 90,
      renderCell: (p) => {
        if (p.value == null) return <span style={{ color: "#999" }}>—</span>;
        return (
          <Tooltip title={`Last approved on ${p.row.last_snapshot_date} (same location/variant)`}>
            <span>{p.value}</span>
          </Tooltip>
        );
      },
    },
    {
      field: "_delta", headerName: "Δ", type: "number", flex: 0.5, minWidth: 80, sortable: false,
      valueGetter: (v, row) => row.last_snapshot_qty == null ? null : row.actual_qty - row.last_snapshot_qty,
      renderCell: (p) => {
        if (p.value == null) return <span style={{ color: "#999" }}>—</span>;
        const v = Number(p.value);
        const color = v > 0 ? "success" : v < 0 ? "error" : "default";
        const sign = v > 0 ? "+" : "";
        return <Chip size="small" label={`${sign}${v}`} color={color} variant="outlined" />;
      },
    },
    { field: "counted_by_username", headerName: "By", flex: 0.7, minWidth: 100, valueGetter: (v) => v || "—" },
    {
      field: "approval_status", headerName: "Status", flex: 0.7, minWidth: 110,
      renderCell: (p) => (
        <Chip size="small" label={p.value} color={STATUS_COLORS[p.value] || "default"} />
      ),
    },
    { field: "rejection_reason", headerName: "Reason", flex: 1, minWidth: 150, valueGetter: (v) => v || "" },
    {
      field: "_actions", headerName: "Actions", flex: 0.8, minWidth: 130, sortable: false,
      renderCell: (p) => {
        const isPending = p.row.approval_status === "submitted" || p.row.approval_status === "draft";
        if (!isPending) return null;
        return (
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Approve">
              <Button size="small" color="success" variant="contained" onClick={() => handleApprove(p.row.id)}
                sx={{ minWidth: 0, px: 1 }}>
                <CheckIcon fontSize="small" />
              </Button>
            </Tooltip>
            <Tooltip title="Reject">
              <Button size="small" color="error" variant="outlined" onClick={() => setRejectTarget(p.row)}
                sx={{ minWidth: 0, px: 1 }}>
                <CloseIcon fontSize="small" />
              </Button>
            </Tooltip>
          </Stack>
        );
      },
    },
  ];

  const isPendingRow = (row) => row.approval_status === "submitted" || row.approval_status === "draft";

  return (
    <Layout>
      <PageHeader title="Count Review" subtitle="Approve or reject submitted stock counts" icon={<FactCheckIcon />} />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} inputProps={{ min: dateFrom }} />
        <TextField size="small" select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="submitted">Submitted</MenuItem>
          <MenuItem value="approved">Approved</MenuItem>
          <MenuItem value="rejected">Rejected</MenuItem>
          <MenuItem value="draft">Draft</MenuItem>
        </TextField>
        <TextField size="small" placeholder="Search item code or name…" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
        <Button variant="contained" color="success" startIcon={<CheckIcon />} disabled={!selectionCount} onClick={handleBulkApprove}>
          Approve {selectionCount > 0 ? `(${selectionCount})` : ""}
        </Button>
      </Stack>

      {data && (
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
          {data.count} record{data.count !== 1 ? "s" : ""} — {dateFrom} to {dateTo}
        </Typography>
      )}

      <DataTable
        rows={data?.results ?? []}
        columns={columns}
        loading={loading}
        checkboxSelection
        isRowSelectable={(p) => isPendingRow(p.row)}
        onRowSelectionModelChange={(m) => setSelection(m)}
        rowSelectionModel={selection}
        paginationMode="server"
        rowCount={data?.count ?? 0}
        paginationModel={{ page: page - 1, pageSize: PAGE_SIZE }}
        onPaginationModelChange={(m) => setPage(m.page + 1)}
        pageSizeOptions={[PAGE_SIZE]}
        emptyText="No counts match this filter"
        height={620}
      />

      <Dialog open={!!rejectTarget} onClose={() => setRejectTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Reject count</DialogTitle>
        <DialogContent>
          {rejectTarget && (
            <>
              <Alert severity="info" sx={{ mb: 2 }}>
                {rejectTarget.item_code} — {rejectTarget.item_name}<br />
                Qty: {rejectTarget.actual_qty}
              </Alert>
              <TextField
                label="Reason" fullWidth multiline minRows={3}
                value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                autoFocus
                helperText="This reason will be visible to the counter and recorded in the audit log."
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleReject} disabled={!rejectReason.trim()}>
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
