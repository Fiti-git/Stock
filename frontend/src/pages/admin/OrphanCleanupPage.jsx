import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Stack, TextField, MenuItem, Button, Tabs, Tab, Alert, Typography, Box, Chip,
} from "@mui/material";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import DeleteIcon from "@mui/icons-material/Delete";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, ConfirmDialog } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { getOutlets } from "../../api/outlets";
import { listOrphans, purgeOrphans } from "../../api/uploads";

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function OrphanCleanupPage() {
  const notify = useNotify();
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useState("");
  const [fromDate, setFromDate] = useState(isoDaysAgo(30));
  const [toDate, setToDate] = useState(isoDaysAgo(0));
  const [tab, setTab] = useState(0); // 0 = items, 1 = pending

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
      .catch(() => {
        setItems([]); setPending([]);
      })
      .finally(() => setLoading(false));
  }, [outletId, fromDate, toDate]);

  useEffect(() => { fetchOrphans(); }, [fetchOrphans]);

  const itemColumns = useMemo(() => [
    { field: "item_code", headerName: "Code", width: 100 },
    { field: "item_name", headerName: "Name", flex: 1.5, minWidth: 200 },
    { field: "category", headerName: "Category", width: 120, valueGetter: (v) => v || "—" },
    { field: "outlet_name", headerName: "Outlet", width: 140 },
    {
      field: "created_at", headerName: "Created", width: 160,
      valueGetter: (v) => v ? new Date(v).toLocaleString() : "—",
    },
    {
      field: "barcode_count", headerName: "Barcodes", type: "number", width: 90,
      renderCell: (p) => p.value > 0 ? <Chip size="small" color="warning" label={p.value} variant="outlined" /> : "0",
    },
    {
      field: "snapshot_count", headerName: "Snaps", type: "number", width: 80,
      renderCell: (p) => p.value > 0 ? <Chip size="small" label={p.value} variant="outlined" /> : "0",
    },
    {
      field: "count_count", headerName: "Counts", type: "number", width: 80,
      renderCell: (p) => p.value > 0 ? <Chip size="small" color="info" label={p.value} variant="outlined" /> : "0",
    },
    {
      field: "upload_log_status", headerName: "Upload", width: 110,
      renderCell: (p) => p.value ? <Chip size="small" label={p.value} color="error" variant="outlined" /> : <Chip size="small" label="NULL" variant="outlined" />,
    },
  ], []);

  const pendingColumns = useMemo(() => [
    { field: "item_code", headerName: "Code", width: 100 },
    { field: "item_name", headerName: "Name", flex: 1.4, minWidth: 200 },
    {
      field: "change_type", headerName: "Type", width: 120,
      renderCell: (p) => <Chip size="small" label={p.value} variant="outlined" />,
    },
    {
      field: "status", headerName: "Status", width: 100,
      renderCell: (p) => <Chip size="small" label={p.value} color={p.value === "pending" ? "warning" : "default"} variant="outlined" />,
    },
    { field: "first_seen_outlet_name", headerName: "Outlet", width: 140 },
    {
      field: "first_seen_date", headerName: "First seen", width: 120,
      valueGetter: (v) => v || "—",
    },
    {
      field: "item_exists", headerName: "Linked", width: 90,
      renderCell: (p) => p.value
        ? <Chip size="small" color="success" label="yes" variant="outlined" />
        : <Chip size="small" color="error" label="no" variant="outlined" />,
    },
    {
      field: "upload_log_status", headerName: "Upload", width: 110,
      renderCell: (p) => p.value ? <Chip size="small" label={p.value} color="error" variant="outlined" /> : <Chip size="small" label="NULL" variant="outlined" />,
    },
  ], []);

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

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
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
        <Button size="small" onClick={fetchOrphans} variant="outlined">Refresh</Button>
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
        <DataTable
          rows={items}
          columns={itemColumns}
          loading={loading}
          checkboxSelection
          onRowSelectionModelChange={(m) => setSelectedItemIds(Array.isArray(m) ? m : Array.from(m))}
          rowSelectionModel={selectedItemIds}
          emptyText="No orphan items"
          height={560}
          initialPageSize={50}
        />
      </Box>
      <Box sx={{ display: tab === 1 ? "block" : "none" }}>
        <DataTable
          rows={pending}
          columns={pendingColumns}
          loading={loading}
          checkboxSelection
          onRowSelectionModelChange={(m) => setSelectedPendingIds(Array.isArray(m) ? m : Array.from(m))}
          rowSelectionModel={selectedPendingIds}
          emptyText="No orphan pending rows"
          height={560}
          initialPageSize={50}
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
