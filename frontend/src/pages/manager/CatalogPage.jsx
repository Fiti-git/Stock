import { useState, useEffect, useRef } from "react";
import {
  Card, CardContent, Typography, Stack, TextField, MenuItem, Chip, Box, Alert,
  IconButton, InputAdornment, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Switch, FormControlLabel, CircularProgress, Grid, Divider,
} from "@mui/material";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import SearchIcon from "@mui/icons-material/Search";
import EditIcon from "@mui/icons-material/Edit";
import HistoryIcon from "@mui/icons-material/History";
import CloseIcon from "@mui/icons-material/Close";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { useOutlet } from "../../contexts/OutletContext";
import { useNotify } from "../../providers/NotificationProvider";
import { getCatalog, getItemPriceHistory } from "../../api/catalog";
import { updateItem } from "../../api/items";

function PriceHistoryDialog({ open, onClose, itemId, itemName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !itemId) return;
    setLoading(true); setError("");
    getItemPriceHistory(itemId)
      .then(({ data }) => setData(data))
      .catch(() => setError("Could not load history."))
      .finally(() => setLoading(false));
  }, [open, itemId]);

  const cols = [
    { field: "snapshot_date", headerName: "Date", flex: 1, minWidth: 120 },
    { field: "selling_price", headerName: "Sell", flex: 1, minWidth: 100, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { field: "cost_price", headerName: "Cost", flex: 1, minWidth: 100, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { field: "pos_quantity", headerName: "POS Qty", flex: 0.8, minWidth: 90, type: "number" },
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Price &amp; POS history
        <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 0.5 }}>
          {itemName}
        </Typography>
        <IconButton onClick={onClose} size="small" sx={{ position: "absolute", right: 8, top: 8 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading && <CircularProgress size={24} />}
        {error && <Alert severity="error">{error}</Alert>}
        {data && (data.history.length === 0
          ? <Typography variant="caption" color="text.secondary">No snapshot history available.</Typography>
          : <DataTable rows={data.history} columns={cols} getRowId={(r) => r.snapshot_date} toolbar={false} height={320} initialPageSize={10} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditItemDialog({ open, onClose, item, onSaved }) {
  const notify = useNotify();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setForm({
      item_name: item.item_name || "",
      category: item.category || "",
      rack_number: item.rack_number || "",
      shelf: item.shelf || "",
      sell_price: item.sell_price ?? "",
      cost_price: item.cost_price ?? "",
      reorder_level: item.reorder_level ?? "",
      on_hand: item.on_hand ?? "",
      is_daily_count: !!item.is_daily_count,
      is_nbci: !!item.is_nbci,
    });
  }, [item]);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const toggle = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.checked }));

  const handleSave = async () => {
    if (!item) return;
    setSaving(true);
    const payload = { ...form };
    // Empty string → drop the field so we don't send "" for numeric ones.
    ["sell_price", "cost_price", "reorder_level", "on_hand"].forEach((k) => {
      if (payload[k] === "" || payload[k] === null) delete payload[k];
    });
    try {
      const { data } = await updateItem(item.id, payload);
      notify.success("Item updated.");
      onSaved(data);
      onClose();
    } catch (err) {
      notify.error(err?.response?.data?.detail || "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Edit product
        <Typography variant="caption" sx={{ display: "block", color: "text.secondary", mt: 0.5, fontFamily: "monospace" }}>
          {item?.item_code}
        </Typography>
        <IconButton onClick={onClose} size="small" sx={{ position: "absolute", right: 8, top: 8 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField fullWidth size="small" label="Item name" value={form.item_name || ""} onChange={set("item_name")} />
          <Grid container spacing={1.5}>
            <Grid item xs={6}><TextField fullWidth size="small" label="Category" value={form.category || ""} onChange={set("category")} /></Grid>
            <Grid item xs={3}><TextField fullWidth size="small" label="Rack" value={form.rack_number || ""} onChange={set("rack_number")} /></Grid>
            <Grid item xs={3}><TextField fullWidth size="small" label="Shelf" value={form.shelf || ""} onChange={set("shelf")} /></Grid>
          </Grid>

          <Divider textAlign="left"><Typography variant="caption" sx={{ color: "text.secondary" }}>PRICING &amp; STOCK</Typography></Divider>
          <Grid container spacing={1.5}>
            <Grid item xs={6}><TextField fullWidth size="small" type="number" label="Sell price" value={form.sell_price ?? ""} onChange={set("sell_price")} inputProps={{ step: "0.01" }} /></Grid>
            <Grid item xs={6}><TextField fullWidth size="small" type="number" label="Cost price" value={form.cost_price ?? ""} onChange={set("cost_price")} inputProps={{ step: "0.01" }} /></Grid>
            <Grid item xs={6}><TextField fullWidth size="small" type="number" label="On-hand qty" value={form.on_hand ?? ""} onChange={set("on_hand")} inputProps={{ step: "0.001" }} /></Grid>
            <Grid item xs={6}><TextField fullWidth size="small" type="number" label="Reorder level" value={form.reorder_level ?? ""} onChange={set("reorder_level")} inputProps={{ step: "0.001" }} /></Grid>
          </Grid>

          <Divider textAlign="left"><Typography variant="caption" sx={{ color: "text.secondary" }}>FLAGS</Typography></Divider>
          <Stack direction="row" spacing={3} flexWrap="wrap">
            <FormControlLabel
              control={<Switch checked={!!form.is_daily_count} onChange={toggle("is_daily_count")} />}
              label={
                <Box>
                  <Typography sx={{ fontSize: "0.9rem", fontWeight: 600 }}>Daily count</Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>Surface this item at the top of every daily count.</Typography>
                </Box>
              }
            />
            <FormControlLabel
              control={<Switch checked={!!form.is_nbci} onChange={toggle("is_nbci")} />}
              label={
                <Box>
                  <Typography sx={{ fontSize: "0.9rem", fontWeight: 600 }}>NBCI</Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>Non-barcoded item (loose goods, etc).</Typography>
                </Box>
              }
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving} sx={{ textTransform: "none" }}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function CatalogPage() {
  const { selectedOutlet } = useOutlet();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [dailyOnly, setDailyOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [categories, setCategories] = useState([]);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const debounceRef = useRef(null);

  const load = (q, cat, pg, outletId) => {
    setLoading(true); setError("");
    const params = { page: pg };
    if (q) params.q = q;
    if (cat) params.category = cat;
    if (outletId) params.outlet = outletId;
    getCatalog(params).then(({ data }) => {
      setItems(data.results);
      setTotalCount(data.count);
      if (pg === 1) setCategories([...new Set(data.results.map((i) => i.category).filter(Boolean))].sort());
    }).catch(() => setError("Failed to load catalog.")).finally(() => setLoading(false));
  };

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); load(search, category, 1, selectedOutlet?.id); }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search, category, selectedOutlet?.id]); // eslint-disable-line

  useEffect(() => { load(search, category, page, selectedOutlet?.id); }, [page]); // eslint-disable-line

  // Daily-count filter is client-side over the current page — backend filter
  // would need an extra param; keep it simple for now.
  const filteredItems = dailyOnly ? items.filter((i) => i.is_daily_count) : items;

  const applyUpdate = (updated) => {
    setItems((prev) => prev.map((i) => i.id === updated.id
      ? { ...i, ...updated, // backend returns full ItemSerializer; map to catalog row shape
          item_name: updated.item_name ?? i.item_name,
          category: updated.category ?? i.category,
          rack_number: updated.rack_number ?? i.rack_number,
          shelf: updated.shelf ?? i.shelf,
          sell_price: updated.sell_price != null ? String(updated.sell_price) : i.sell_price,
          cost_price: updated.cost_price != null ? String(updated.cost_price) : i.cost_price,
          on_hand: updated.on_hand != null ? String(updated.on_hand) : i.on_hand,
          reorder_level: updated.reorder_level != null ? String(updated.reorder_level) : i.reorder_level,
          is_daily_count: !!updated.is_daily_count,
          is_nbci: !!updated.is_nbci,
        }
      : i
    ));
  };

  const columns = [
    {
      field: "is_daily_count", headerName: "", width: 44, sortable: false, filterable: false,
      renderCell: (p) => p.value
        ? <Tooltip title="Daily-count item"><StarIcon sx={{ fontSize: 18, color: "#f59e0b" }} /></Tooltip>
        : <StarBorderIcon sx={{ fontSize: 18, color: "rgba(15,23,42,0.2)" }} />,
    },
    { field: "item_name", headerName: "Item Name", flex: 1.4, minWidth: 200 },
    { field: "item_code", headerName: "SKU / Code", flex: 0.8, minWidth: 120 },
    { field: "barcode", headerName: "Barcode", flex: 0.9, minWidth: 130, valueGetter: (v) => v || "—" },
    { field: "category", headerName: "Category", flex: 0.8, minWidth: 120, valueGetter: (v) => v || "—" },
    { field: "latest_selling_price", headerName: "Sell", type: "number", flex: 0.5, minWidth: 80, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { field: "latest_cost_price", headerName: "Cost", type: "number", flex: 0.5, minWidth: 80, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    {
      field: "latest_pos_qty", headerName: "POS Qty", type: "number", flex: 0.55, minWidth: 90,
      renderCell: (p) => {
        if (p.value == null) return <span style={{ color: "rgba(15,23,42,0.3)" }}>—</span>;
        return (
          <Tooltip title={p.row.latest_snapshot_date ? `As of ${p.row.latest_snapshot_date}` : ""}>
            <span style={{ fontWeight: 600 }}>{Number(p.value).toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
          </Tooltip>
        );
      },
    },
    {
      field: "on_hand", headerName: "On hand", type: "number", flex: 0.55, minWidth: 90,
      renderCell: (p) => p.value == null ? <span style={{ color: "rgba(15,23,42,0.3)" }}>—</span> : Number(p.value).toLocaleString(undefined, { maximumFractionDigits: 3 }),
    },
    {
      field: "oldest_lot_age_days", headerName: "Stock age", type: "number", flex: 0.6, minWidth: 100,
      renderCell: (p) => {
        if (p.value == null) return <span style={{ color: "rgba(15,23,42,0.3)" }}>—</span>;
        const days = p.value;
        const color = days <= 30 ? "success" : days <= 60 ? "primary" : days <= 90 ? "warning" : "error";
        const avg = p.row.weighted_avg_age_days;
        return (
          <Tooltip title={avg ? `Avg age ${Number(avg).toFixed(1)}d` : ""}>
            <Chip size="small" label={`${days}d`} color={color} variant="outlined" />
          </Tooltip>
        );
      },
    },
    {
      field: "status", headerName: "Status", flex: 0.7, minWidth: 110,
      renderCell: (p) => p.value === "active"
        ? <Chip size="small" label="Active" color="success" variant="outlined" />
        : <Chip size="small" label="Pending Barcode" color="warning" variant="outlined" />,
    },
    {
      field: "actions", headerName: "Actions", width: 110, sortable: false, filterable: false, align: "center", headerAlign: "center",
      renderCell: (p) => (
        <Stack direction="row" spacing={0.25}>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setEditTarget(p.row); }} sx={{ color: "primary.main" }}>
              <EditIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Price &amp; POS history">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHistoryTarget(p.row); }} sx={{ color: "text.secondary" }}>
              <HistoryIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader
        title="Product Catalog"
        subtitle={totalCount > 0 ? `${totalCount.toLocaleString()} items in this outlet` : "Browse products, prices, POS quantities and stock age"}
        icon={<Inventory2Icon />}
      />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2, alignItems: { sm: "center" } }}>
        <TextField size="small" fullWidth placeholder="Search by name, SKU, or barcode…" value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <TextField size="small" select label="Category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} sx={{ minWidth: 180 }}>
          <MenuItem value="">All categories</MenuItem>
          {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
        </TextField>
        <FormControlLabel
          control={<Switch size="small" checked={dailyOnly} onChange={(e) => setDailyOnly(e.target.checked)} />}
          label={<Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>Daily-count only</Typography>}
        />
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <DataTable
        rows={filteredItems}
        columns={columns}
        loading={loading}
        paginationMode="server"
        rowCount={totalCount}
        paginationModel={{ page: page - 1, pageSize: 50 }}
        onPaginationModelChange={(m) => setPage(m.page + 1)}
        pageSizeOptions={[50]}
        toolbar={false}
        height={640}
        emptyText="No products found"
      />

      <PriceHistoryDialog
        open={!!historyTarget}
        onClose={() => setHistoryTarget(null)}
        itemId={historyTarget?.id}
        itemName={historyTarget?.item_name}
      />
      <EditItemDialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        item={editTarget}
        onSaved={applyUpdate}
      />
    </Layout>
  );
}
