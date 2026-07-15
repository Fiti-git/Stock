import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, Typography, Stack, TextField, MenuItem, Chip, Box, Alert, IconButton,
  InputAdornment, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Switch, FormControlLabel, CircularProgress, Grid, Divider, Drawer,
} from "@mui/material";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import SearchIcon from "@mui/icons-material/Search";
import EditIcon from "@mui/icons-material/Edit";
import HistoryIcon from "@mui/icons-material/History";
import CloseIcon from "@mui/icons-material/Close";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import TimelineIcon from "@mui/icons-material/Timeline";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { useOutlet } from "../../contexts/OutletContext";
import { useAuth } from "../../contexts/AuthContext";
import { useNotify } from "../../providers/NotificationProvider";
import { getCatalog, getItemPriceHistory } from "../../api/catalog";
import {
  updateItem, listItemBarcodes, addItemBarcode, deleteItemBarcode, setPrimaryBarcode,
} from "../../api/items";
import { getOutlets } from "../../api/outlets";

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

function BarcodeDrawer({ open, onClose, item, onChanged }) {
  const notify = useNotify();
  const [barcodes, setBarcodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newBarcode, setNewBarcode] = useState("");
  const [adding, setAdding] = useState(false);

  const load = () => {
    if (!item) return;
    setLoading(true);
    listItemBarcodes(item.id)
      .then(({ data }) => setBarcodes(Array.isArray(data) ? data : (data.results || [])))
      .catch(() => setBarcodes([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (open && item) load(); /* eslint-disable-next-line */ }, [open, item?.id]);

  const handleAdd = async () => {
    const code = newBarcode.trim();
    if (!code || !item) return;
    setAdding(true);
    try {
      await addItemBarcode(item.id, code);
      notify.success("Barcode added.");
      setNewBarcode("");
      load();
      onChanged?.();
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      if (status === 409 && data?.conflict) {
        notify.error(`Barcode "${code}" already assigned to ${data.conflict.item_code} — ${data.conflict.item_name}.`);
      } else {
        notify.error(data?.detail || "Failed to add barcode.");
      }
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (bc) => {
    try {
      await deleteItemBarcode(item.id, bc.id);
      notify.success("Barcode removed.");
      load();
      onChanged?.();
    } catch (err) {
      notify.error(err.response?.data?.detail || "Failed to delete.");
    }
  };

  const handleSetPrimary = async (bc) => {
    try {
      await setPrimaryBarcode(item.id, bc.id);
      notify.success("Primary barcode updated.");
      load();
      onChanged?.();
    } catch (err) {
      notify.error(err.response?.data?.detail || "Failed to set primary.");
    }
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: "100%", sm: 460 } } }}>
      <Box sx={{ p: 2.5, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: 1, borderColor: "divider" }}>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: "1.05rem" }}>Barcodes</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
            {item?.item_code} — {item?.item_name}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </Box>

      <Box sx={{ p: 2.5, flex: 1, overflow: "auto" }}>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <TextField
            size="small" fullWidth placeholder="New barcode…"
            value={newBarcode} onChange={(e) => setNewBarcode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            InputProps={{ sx: { fontFamily: "monospace" } }}
          />
          <Button variant="contained" onClick={handleAdd} disabled={adding || !newBarcode.trim()} startIcon={<AddIcon />} sx={{ textTransform: "none", whiteSpace: "nowrap" }}>
            Add
          </Button>
        </Stack>

        {loading && <CircularProgress size={22} />}
        {!loading && barcodes.length === 0 && (
          <Typography variant="body2" color="text.secondary">No barcodes assigned yet.</Typography>
        )}
        <Stack spacing={1}>
          {barcodes.map((bc) => (
            <Card key={bc.id} variant="outlined" sx={{ p: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ fontFamily: "monospace", fontWeight: 600 }}>{bc.barcode}</Typography>
                  {bc.is_primary && <Chip size="small" label="Primary" color="warning" variant="outlined" icon={<StarIcon fontSize="small" />} />}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {bc.assigned_at ? `Added ${new Date(bc.assigned_at).toLocaleDateString()}` : ""}
                  {bc.assigned_by_username ? ` by ${bc.assigned_by_username}` : ""}
                </Typography>
              </Box>
              <Stack direction="row" spacing={0.5}>
                {!bc.is_primary && (
                  <Tooltip title="Set as primary">
                    <IconButton size="small" onClick={() => handleSetPrimary(bc)}>
                      <StarBorderIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title="Delete">
                  <IconButton size="small" onClick={() => handleDelete(bc)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Card>
          ))}
        </Stack>
      </Box>
    </Drawer>
  );
}

export default function CatalogPage() {
  const { user } = useAuth();
  const { selectedOutlet, setSelectedOutlet } = useOutlet();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

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
  const [barcodeTarget, setBarcodeTarget] = useState(null);
  const [outlets, setOutlets] = useState([]);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (isAdmin) getOutlets().then(({ data }) => setOutlets(Array.isArray(data) ? data : []));
  }, [isAdmin]);

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

  const filteredItems = dailyOnly ? items.filter((i) => i.is_daily_count) : items;

  const applyUpdate = (updated) => {
    setItems((prev) => prev.map((i) => i.id === updated.id
      ? { ...i, ...updated,
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

  const refreshCurrent = () => load(search, category, page, selectedOutlet?.id);

  const columns = [
    {
      field: "is_daily_count", headerName: "", width: 44, sortable: false, filterable: false,
      renderCell: (p) => p.value
        ? <Tooltip title="Daily-count item"><StarIcon sx={{ fontSize: 18, color: "#f59e0b" }} /></Tooltip>
        : <StarBorderIcon sx={{ fontSize: 18, color: "rgba(15,23,42,0.2)" }} />,
    },
    { field: "item_name", headerName: "Item Name", flex: 1.4, minWidth: 200 },
    { field: "item_code", headerName: "SKU / Code", flex: 0.8, minWidth: 120 },
    {
      field: "barcode", headerName: "Barcode", flex: 0.9, minWidth: 140,
      renderCell: (p) => {
        const primary = p.row.barcode;
        const extra = (p.row.barcodes?.length || 0) - (primary ? 1 : 0);
        return (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ cursor: "pointer" }}
                 onClick={(e) => { e.stopPropagation(); setBarcodeTarget(p.row); }}>
            {primary
              ? <Typography variant="body2" sx={{ fontFamily: "monospace" }}>{primary}</Typography>
              : <Chip size="small" label="Add" icon={<AddIcon fontSize="small" />} variant="outlined" />}
            {extra > 0 && <Chip size="small" label={`+${extra}`} variant="outlined" />}
          </Stack>
        );
      },
    },
    { field: "category", headerName: "Category", flex: 0.8, minWidth: 120, valueGetter: (v) => v || "—" },
    { field: "rack_number", headerName: "Rack", flex: 0.4, minWidth: 70, valueGetter: (v) => v || "—" },
    { field: "shelf", headerName: "Shelf", flex: 0.4, minWidth: 70, valueGetter: (v) => v || "—" },
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
      field: "is_nbci", headerName: "NBCI", flex: 0.4, minWidth: 70,
      renderCell: (p) => p.value
        ? <Chip size="small" label="Yes" color="secondary" variant="outlined" />
        : <span style={{ color: "rgba(15,23,42,0.3)" }}>—</span>,
    },
    {
      field: "status", headerName: "Status", flex: 0.7, minWidth: 110,
      renderCell: (p) => p.value === "active"
        ? <Chip size="small" label="Active" color="success" variant="outlined" />
        : <Chip size="small" label="Pending Barcode" color="warning" variant="outlined" />,
    },
    ...(isAdmin ? [{ field: "outlet_name", headerName: "Outlet", flex: 0.8, minWidth: 130, valueGetter: (v) => v || "—" }] : []),
    {
      field: "actions", headerName: "Actions", width: 170, sortable: false, filterable: false, align: "center", headerAlign: "center",
      renderCell: (p) => (
        <Stack direction="row" spacing={0.25}>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setEditTarget(p.row); }} sx={{ color: "primary.main" }}>
              <EditIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Barcodes">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setBarcodeTarget(p.row); }} sx={{ color: "text.secondary" }}>
              <QrCodeScannerIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Price &amp; POS history">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setHistoryTarget(p.row); }} sx={{ color: "text.secondary" }}>
              <HistoryIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Full product timeline">
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); navigate(`/admin/products/${p.row.id}/history`); }} sx={{ color: "text.secondary" }}>
              <TimelineIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  const onOutletPick = (id) => {
    const o = outlets.find((x) => x.id === id);
    setSelectedOutlet(o ? { id: o.id, outlet_name: o.outlet_name } : null);
  };

  return (
    <Layout>
      <PageHeader
        title="Product Catalog"
        subtitle={totalCount > 0
          ? `${totalCount.toLocaleString()} items — edit details, manage barcodes, view history`
          : "Browse products, prices, POS quantities, stock age, and barcodes"}
        icon={<Inventory2Icon />}
        actions={
          isAdmin && outlets.length > 0 ? (
            <TextField size="small" select label="Outlet" value={selectedOutlet?.id || ""}
              onChange={(e) => onOutletPick(e.target.value)} sx={{ minWidth: 200 }}>
              <MenuItem value=""><em>All outlets</em></MenuItem>
              {outlets.map((o) => <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>)}
            </TextField>
          ) : null
        }
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
      <BarcodeDrawer
        open={!!barcodeTarget}
        onClose={() => setBarcodeTarget(null)}
        item={barcodeTarget}
        onChanged={refreshCurrent}
      />
    </Layout>
  );
}
