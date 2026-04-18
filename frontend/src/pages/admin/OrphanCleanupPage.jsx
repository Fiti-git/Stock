import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Stack, TextField, MenuItem, Button, Tabs, Tab, Alert, Typography, Box, Chip,
  Paper, Table, TableHead, TableBody, TableRow, TableCell, Checkbox,
  TablePagination, CircularProgress, Tooltip,
} from "@mui/material";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import DeleteIcon from "@mui/icons-material/Delete";
import Layout from "../../components/Layout";
import { PageHeader, ConfirmDialog } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { getOutlets } from "../../api/outlets";
import { listOrphans, purgeOrphans } from "../../api/uploads";

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function SelectableTable({
  rows, columns, selected, onSelectedChange, loading, emptyText, getRowId = (r) => r.id,
}) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  useEffect(() => { setPage(0); }, [rows.length]);

  const pageRows = useMemo(
    () => rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [rows, page, rowsPerPage]
  );
  const pageIds = useMemo(() => pageRows.map(getRowId), [pageRows, getRowId]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedOnPage = pageIds.filter((id) => selectedSet.has(id)).length;
  const allOnPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;
  const someOnPageSelected = selectedOnPage > 0 && !allOnPageSelected;

  const togglePage = () => {
    if (allOnPageSelected) {
      onSelectedChange(selected.filter((id) => !pageIds.includes(id)));
    } else {
      onSelectedChange(Array.from(new Set([...selected, ...pageIds])));
    }
  };

  const toggleRow = (id) => {
    if (selectedSet.has(id)) {
      onSelectedChange(selected.filter((x) => x !== id));
    } else {
      onSelectedChange([...selected, id]);
    }
  };

  return (
    <Paper variant="outlined">
      <Box sx={{ maxHeight: 520, overflow: "auto" }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  size="small"
                  indeterminate={someOnPageSelected}
                  checked={allOnPageSelected}
                  onChange={togglePage}
                  disabled={pageRows.length === 0}
                />
              </TableCell>
              {columns.map((c) => (
                <TableCell key={c.field} sx={{ whiteSpace: "nowrap", fontWeight: 600 }}>
                  {c.headerName}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={columns.length + 1} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={20} />
                </TableCell>
              </TableRow>
            )}
            {!loading && pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + 1} align="center" sx={{ py: 4, color: "text.secondary" }}>
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
            {!loading && pageRows.map((row) => {
              const id = getRowId(row);
              const isSel = selectedSet.has(id);
              return (
                <TableRow key={id} hover selected={isSel} sx={{ cursor: "pointer" }} onClick={() => toggleRow(id)}>
                  <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                    <Checkbox size="small" checked={isSel} onChange={() => toggleRow(id)} />
                  </TableCell>
                  {columns.map((c) => (
                    <TableCell key={c.field} sx={{ whiteSpace: "nowrap" }}>
                      {c.render ? c.render(row) : (row[c.field] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
      <TablePagination
        component="div"
        count={rows.length}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
        rowsPerPageOptions={[25, 50, 100]}
      />
    </Paper>
  );
}

export default function OrphanCleanupPage() {
  const notify = useNotify();
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useState("");
  const [fromDate, setFromDate] = useState(isoDaysAgo(30));
  const [toDate, setToDate] = useState(isoDaysAgo(0));
  const [tab, setTab] = useState(0);

  const [items, setItems] = useState([]);
  const [pending, setPending] = useState([]);
  const [itemsTruncated, setItemsTruncated] = useState(false);
  const [pendingTruncated, setPendingTruncated] = useState(false);
  const [loading, setLoading] = useState(false);

  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [selectedPendingIds, setSelectedPendingIds] = useState([]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getOutlets().then(({ data }) => setOutlets(Array.isArray(data) ? data : []));
  }, []);

  const fetchOrphans = useCallback(() => {
    setLoading(true);
    listOrphans({
      outletId: outletId || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      type: "both",
    })
      .then(({ data }) => {
        setItems(data.items || []);
        setPending(data.pending || []);
        setItemsTruncated(Boolean(data.items_truncated));
        setPendingTruncated(Boolean(data.pending_truncated));
      })
      .catch(() => { setItems([]); setPending([]); })
      .finally(() => setLoading(false));
  }, [outletId, fromDate, toDate]);

  useEffect(() => { fetchOrphans(); }, [fetchOrphans]);

  const itemColumns = [
    { field: "item_code", headerName: "Code" },
    { field: "item_name", headerName: "Name" },
    { field: "category", headerName: "Category", render: (r) => r.category || "—" },
    { field: "outlet_name", headerName: "Outlet" },
    {
      field: "created_at", headerName: "Created",
      render: (r) => r.created_at ? new Date(r.created_at).toLocaleString() : "—",
    },
    {
      field: "barcode_count", headerName: "Barcodes",
      render: (r) => r.barcode_count > 0
        ? <Chip size="small" color="warning" label={r.barcode_count} variant="outlined" /> : "0",
    },
    {
      field: "snapshot_count", headerName: "Snaps",
      render: (r) => r.snapshot_count > 0
        ? <Chip size="small" label={r.snapshot_count} variant="outlined" /> : "0",
    },
    {
      field: "count_count", headerName: "Counts",
      render: (r) => r.count_count > 0
        ? <Chip size="small" color="info" label={r.count_count} variant="outlined" /> : "0",
    },
    {
      field: "upload_log_status", headerName: "Upload",
      render: (r) => r.upload_log_status
        ? <Chip size="small" label={r.upload_log_status} color="error" variant="outlined" />
        : <Chip size="small" label="NULL" variant="outlined" />,
    },
  ];

  const pendingColumns = [
    { field: "item_code", headerName: "Code" },
    { field: "item_name", headerName: "Name" },
    {
      field: "change_type", headerName: "Type",
      render: (r) => <Chip size="small" label={r.change_type} variant="outlined" />,
    },
    {
      field: "status", headerName: "Status",
      render: (r) => <Chip size="small" label={r.status} color={r.status === "pending" ? "warning" : "default"} variant="outlined" />,
    },
    { field: "first_seen_outlet_name", headerName: "Outlet" },
    { field: "first_seen_date", headerName: "First seen", render: (r) => r.first_seen_date || "—" },
    {
      field: "item_exists", headerName: "Linked",
      render: (r) => r.item_exists
        ? <Chip size="small" color="success" label="yes" variant="outlined" />
        : <Chip size="small" color="error" label="no" variant="outlined" />,
    },
    {
      field: "upload_log_status", headerName: "Upload",
      render: (r) => r.upload_log_status
        ? <Chip size="small" label={r.upload_log_status} color="error" variant="outlined" />
        : <Chip size="small" label="NULL" variant="outlined" />,
    },
  ];

  const selectionCount = tab === 0 ? selectedItemIds.length : selectedPendingIds.length;

  const handlePurge = async () => {
    setDeleting(true);
    try {
      const { data } = await purgeOrphans({
        itemIds: selectedItemIds,
        pendingIds: selectedPendingIds,
      });
      notify.success(
        `Removed ${data.items_deleted} item${data.items_deleted === 1 ? "" : "s"}, ${data.pending_deleted} pending, ${data.sweep_deleted} orphan sweep.`
      );
      setSelectedItemIds([]);
      setSelectedPendingIds([]);
      setConfirmOpen(false);
      fetchOrphans();
    } catch (err) {
      notify.error(err.response?.data?.detail || "Purge failed.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Orphan Cleanup"
        subtitle="Items and pending rows whose upload is untracked or already deleted. Select and purge."
        icon={<CleaningServicesIcon />}
      />

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2, flexWrap: "wrap" }} useFlexGap>
        <TextField
          size="small" select label="Outlet" value={outletId}
          onChange={(e) => setOutletId(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">All outlets</MenuItem>
          {outlets.map((o) => (
            <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>
          ))}
        </TextField>
        <TextField
          size="small" type="date" label="From"
          InputLabelProps={{ shrink: true }}
          value={fromDate} onChange={(e) => setFromDate(e.target.value)}
        />
        <TextField
          size="small" type="date" label="To"
          InputLabelProps={{ shrink: true }}
          value={toDate} onChange={(e) => setToDate(e.target.value)}
        />
        <Tooltip title="Refresh">
          <Button size="small" onClick={fetchOrphans} variant="outlined">Refresh</Button>
        </Tooltip>
      </Stack>

      <Alert severity="info" sx={{ mb: 2 }}>
        These rows have either <b>no upload link</b> (created before FK tracking) or point to a <b>DELETED upload</b>. Deleting is permanent.
      </Alert>

      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label={`Items (${items.length}${itemsTruncated ? "+" : ""})`} />
          <Tab label={`Pending (${pending.length}${pendingTruncated ? "+" : ""})`} />
        </Tabs>

        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" color="text.secondary">
            {selectionCount > 0 ? `${selectionCount} selected` : "Nothing selected"}
          </Typography>
          <Button
            color="error" variant="contained" size="small" startIcon={<DeleteIcon />}
            disabled={selectionCount === 0}
            onClick={() => setConfirmOpen(true)}
          >
            Delete selected
          </Button>
        </Stack>
      </Stack>

      {(itemsTruncated && tab === 0) && (
        <Alert severity="warning" sx={{ mb: 1 }}>Showing first 500 items. Narrow the filter to see more.</Alert>
      )}
      {(pendingTruncated && tab === 1) && (
        <Alert severity="warning" sx={{ mb: 1 }}>Showing first 500 pending rows. Narrow the filter to see more.</Alert>
      )}

      <Box sx={{ display: tab === 0 ? "block" : "none" }}>
        <SelectableTable
          rows={items}
          columns={itemColumns}
          selected={selectedItemIds}
          onSelectedChange={setSelectedItemIds}
          loading={loading}
          emptyText="No orphan items"
        />
      </Box>
      <Box sx={{ display: tab === 1 ? "block" : "none" }}>
        <SelectableTable
          rows={pending}
          columns={pendingColumns}
          selected={selectedPendingIds}
          onSelectedChange={setSelectedPendingIds}
          loading={loading}
          emptyText="No orphan pending rows"
        />
      </Box>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handlePurge}
        loading={deleting}
        title="Delete orphan rows"
        confirmLabel={`Delete ${selectionCount}`}
        message={
          <Box>
            <Typography variant="body2" sx={{ mb: 1 }}>
              This will permanently delete{" "}
              <b>{selectedItemIds.length}</b> item{selectedItemIds.length === 1 ? "" : "s"}
              {" and "}
              <b>{selectedPendingIds.length}</b> pending row{selectedPendingIds.length === 1 ? "" : "s"}.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Each deleted item cascades to its barcodes, POS snapshots, and stock counts.
            </Typography>
            <Alert severity="warning" sx={{ mt: 2 }}>This cannot be undone.</Alert>
          </Box>
        }
      />
    </Layout>
  );
}
