import { useState, useEffect, useRef } from "react";
import {
  Box, Card, CardContent, Typography, Stack, TextField, MenuItem, Tabs, Tab, Chip,
  Button, Grid, Pagination, Alert, InputAdornment,
} from "@mui/material";
import ChecklistIcon from "@mui/icons-material/Checklist";
import SearchIcon from "@mui/icons-material/Search";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import CheckIcon from "@mui/icons-material/Check";
import Layout from "../../components/Layout";
import { PageHeader, EmptyState } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { getPendingItems, assignBarcode, acceptChange, rejectChange, markPendingNbci } from "../../api/items";
import { useOutlet } from "../../contexts/OutletContext";

function NewCodeCard({ item, onAssigned }) {
  const notify = useNotify();
  const [assigning, setAssigning] = useState(false);
  const [inputs, setInputs] = useState({ barcode: "", category: "", rack_number: "", shelf: "" });
  const [nbci, setNbci] = useState("no");
  const set = (k, v) => setInputs((p) => ({ ...p, [k]: v }));

  const handleAssign = async () => {
    if (!inputs.barcode.trim()) return;
    setAssigning(true);
    try {
      await assignBarcode(item.id, inputs.barcode.trim(), inputs.category, inputs.rack_number, inputs.shelf);
      notify.success("Barcode assigned.");
      onAssigned(item.id);
    } catch (err) { notify.error(err.response?.data?.detail || "Failed to assign barcode."); }
    finally { setAssigning(false); }
  };

  const handleNbciChange = async (next) => {
    setNbci(next);
    if (next !== "yes") return;
    setAssigning(true);
    try {
      await markPendingNbci(item.id);
      notify.success("Marked as Non-Barcoded Item.");
      onAssigned(item.id);
    } catch (err) {
      setNbci("no");
      notify.error(err.response?.data?.detail || "Failed to mark as NBCI.");
    } finally { setAssigning(false); }
  };

  return (
    <Card variant="outlined" sx={{ borderLeft: 4, borderLeftColor: "warning.main" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>{item.item_name}</Typography>
            <Chip size="small" variant="outlined" label={item.item_code} sx={{ mt: 0.5, fontFamily: "monospace" }} />
          </Box>
          <Chip size="small" label="New Item" color="warning" />
        </Stack>

        <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: "wrap" }}>
          <Typography variant="caption" color="text.secondary">First seen: <b>{item.first_seen_date}</b></Typography>
          <Typography variant="caption" color="text.secondary">Outlet: <b>{item.first_seen_outlet_name}</b></Typography>
          {item.latest_cost_price != null && <Typography variant="caption" color="text.secondary">Cost: <b>LKR {Number(item.latest_cost_price).toFixed(2)}</b></Typography>}
          {item.latest_selling_price != null && <Typography variant="caption" color="text.secondary">Sell: <b>LKR {Number(item.latest_selling_price).toFixed(2)}</b></Typography>}
        </Stack>

        <TextField
          select size="small" label="NBCI (Non-Barcoded Item)"
          value={nbci} onChange={(e) => handleNbciChange(e.target.value)}
          disabled={assigning} sx={{ mb: 2, minWidth: 220 }}
          helperText={nbci === "yes" ? "Removing from queue…" : "Select Yes if this item has no barcode — it will leave the queue."}
        >
          <MenuItem value="no">No</MenuItem>
          <MenuItem value="yes">Yes</MenuItem>
        </TextField>

        <TextField fullWidth autoComplete="off" label="Barcode" placeholder="Scan or type barcode…"
          InputProps={{ startAdornment: <InputAdornment position="start"><QrCodeScannerIcon fontSize="small" /></InputAdornment>, style: { fontFamily: "monospace" } }}
          value={inputs.barcode} onChange={(e) => set("barcode", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAssign()} sx={{ mb: 2 }} />

        <Grid container spacing={1} sx={{ mb: 2 }}>
          <Grid item xs={4}><TextField size="small" fullWidth label="Category" placeholder="BISCUITS" value={inputs.category} onChange={(e) => set("category", e.target.value)} /></Grid>
          <Grid item xs={4}><TextField size="small" fullWidth label="Rack No." placeholder="R3" value={inputs.rack_number} onChange={(e) => set("rack_number", e.target.value)} /></Grid>
          <Grid item xs={4}><TextField size="small" fullWidth label="Shelf" placeholder="S2" value={inputs.shelf} onChange={(e) => set("shelf", e.target.value)} /></Grid>
        </Grid>

        <Button fullWidth variant="contained" color="success" size="large" startIcon={<CheckIcon />}
          disabled={assigning || !inputs.barcode.trim()} onClick={handleAssign}>
          {assigning ? "Saving…" : "Assign Barcode"}
        </Button>
      </CardContent>
    </Card>
  );
}

function DataChangedCard({ item, onResolved }) {
  const notify = useNotify();
  const [loading, setLoading] = useState(false);
  const changed = item.changed_fields || {};

  const handle = async (fn, okMsg) => {
    setLoading(true);
    try { await fn(item.id); notify.success(okMsg); onResolved(item.id); }
    catch (err) { notify.error(err.response?.data?.detail || "Failed."); }
    finally { setLoading(false); }
  };

  return (
    <Card variant="outlined" sx={{ borderLeft: 4, borderLeftColor: "info.main" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>{item.item_name}</Typography>
            <Chip size="small" variant="outlined" label={item.item_code} sx={{ mt: 0.5, fontFamily: "monospace" }} />
          </Box>
          <Chip size="small" label="Data Changed" color="info" />
        </Stack>

        <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: "wrap" }}>
          <Typography variant="caption" color="text.secondary">Outlet: <b>{item.first_seen_outlet_name}</b></Typography>
          <Typography variant="caption" color="text.secondary">Flagged: <b>{item.first_seen_date}</b></Typography>
        </Stack>

        <Stack spacing={1} sx={{ mb: 2 }}>
          {Object.entries(changed).map(([field, diff]) => (
            <Stack key={field} direction="row" alignItems="center" spacing={1} flexWrap="wrap">
              <Typography variant="caption" fontWeight={600} sx={{ width: 96, textTransform: "capitalize" }}>{field.replace(/_/g, " ")}</Typography>
              <Chip size="small" color="error" variant="outlined" label={diff.old ?? "—"} sx={{ textDecoration: "line-through" }} />
              <Typography variant="caption" color="text.secondary">→</Typography>
              <Chip size="small" color="success" label={diff.new ?? "—"} />
            </Stack>
          ))}
          {Object.keys(changed).length === 0 && <Typography variant="caption" color="text.secondary">No field details available.</Typography>}
        </Stack>

        <Stack direction="row" spacing={1}>
          <Button fullWidth variant="contained" disabled={loading} onClick={() => handle(acceptChange, "Change accepted.")}>Accept Update</Button>
          <Button fullWidth variant="outlined" disabled={loading} onClick={() => handle(rejectChange, "Change rejected.")}>Keep Original</Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function PendingItemsPage() {
  // Outlet scope is driven by the global TopBar picker. Non-admins resolve
  // to their own outlet (outletId=null), admins can pick a specific outlet
  // or "All outlets" from the header.
  const { outletId } = useOutlet();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("new");
  const searchTimer = useRef(null);
  const PAGE_SIZE = 10;

  const fetchPage = (p, outlet, q) => {
    setLoading(true);
    getPendingItems(p, outlet || null, q || "")
      .then(({ data }) => {
        if (data && Array.isArray(data.results)) { setTotalCount(data.count); setItems(data.results); }
        else { setItems(Array.isArray(data) ? data : []); setTotalCount(Array.isArray(data) ? data.length : 0); }
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { fetchPage(page, outletId, search); }, [page, outletId]); // eslint-disable-line

  const onSearchChange = (e) => {
    const v = e.target.value; setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(1); fetchPage(1, outletId, v); }, 300);
  };

  const removeItem = (id) => { setItems((p) => p.filter((i) => i.id !== id)); setTotalCount((c) => c - 1); };
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const newItems = items.filter((i) => i.change_type === "new_code" || !i.change_type);
  const changedItems = items.filter((i) => i.change_type === "data_changed");

  return (
    <Layout>
      <PageHeader
        title="Pending Review Queue"
        subtitle="New items need barcodes. Changed items need review before the master record is updated."
        icon={<ChecklistIcon />}
        actions={totalCount > 0 && <Chip label={`${totalCount} pending`} />}
      />

      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <TextField size="small" fullWidth label="Search" placeholder="Item code or name…" value={search} onChange={onSearchChange}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
          <Typography variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
            Outlet scope is set from the top header.
          </Typography>
        </CardContent>
      </Card>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
        <Tab value="new" label={<Stack direction="row" spacing={1} alignItems="center"><span>New Items</span><Chip size="small" label={newItems.length} /></Stack>} />
        <Tab value="changed" label={<Stack direction="row" spacing={1} alignItems="center"><span>Data Changes</span><Chip size="small" label={changedItems.length} /></Stack>} />
      </Tabs>

      {loading && <Alert severity="info">Loading…</Alert>}
      {!loading && items.length === 0 && <EmptyState title={search ? "No items match" : "All caught up!"} description="No items awaiting review." />}

      {!loading && tab === "new" && (
        newItems.length === 0
          ? <EmptyState title="No new items awaiting barcode assignment" />
          : <Stack spacing={2}>{newItems.map((item) => <NewCodeCard key={item.id} item={item} onAssigned={removeItem} />)}</Stack>
      )}
      {!loading && tab === "changed" && (
        changedItems.length === 0
          ? <EmptyState title="No data changes pending review" />
          : <Stack spacing={2}>{changedItems.map((item) => <DataChangedCard key={item.id} item={item} onResolved={removeItem} />)}</Stack>
      )}

      {totalPages > 1 && (
        <Stack alignItems="center" sx={{ mt: 3 }}>
          <Pagination count={totalPages} page={page} onChange={(_, p) => setPage(p)} color="primary" />
        </Stack>
      )}
    </Layout>
  );
}
