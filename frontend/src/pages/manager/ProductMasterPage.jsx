import { useState, useEffect, useRef } from "react";
import {
  Stack, TextField, MenuItem, IconButton, Tooltip, Chip, InputAdornment, Grid, Typography, Box, Button, Divider, CircularProgress,
} from "@mui/material";
import EditNoteIcon from "@mui/icons-material/EditNote";
import EditIcon from "@mui/icons-material/Edit";
import SearchIcon from "@mui/icons-material/Search";
import DeleteIcon from "@mui/icons-material/Delete";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import AddIcon from "@mui/icons-material/Add";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, FormDialog } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { useAuth } from "../../contexts/AuthContext";
import { getOutlets } from "../../api/outlets";
import { updateItem, listItemBarcodes, addItemBarcode, deleteItemBarcode, setPrimaryBarcode } from "../../api/items";
import api from "../../api/client";

export default function ProductMasterPage() {
  const { user } = useAuth();
  const notify = useNotify();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [outlets, setOutlets] = useState([]);
  const [selectedOutlet, setSelectedOutlet] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [barcodes, setBarcodes] = useState([]);
  const [barcodesLoading, setBarcodesLoading] = useState(false);
  const [newBarcode, setNewBarcode] = useState("");
  const [addingBarcode, setAddingBarcode] = useState(false);
  const searchTimer = useRef(null);
  const PAGE_SIZE = 50;

  useEffect(() => { if (isAdmin) getOutlets().then(({ data }) => setOutlets(Array.isArray(data) ? data : [])); }, [isAdmin]);

  const fetchItems = (p, outlet, q) => {
    setLoading(true);
    const params = { page: p, page_size: PAGE_SIZE };
    if (outlet) params.outlet = outlet;
    if (q) params.q = q;
    api.get("/items/", { params }).then(({ data }) => {
      const results = data.results ?? data;
      setItems(Array.isArray(results) ? results : []);
      setTotalCount(data.count ?? results.length);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { fetchItems(page, selectedOutlet, search); }, [page, selectedOutlet]); // eslint-disable-line

  const onSearchChange = (e) => {
    const v = e.target.value; setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(1); fetchItems(1, selectedOutlet, v); }, 300);
  };

  const openEdit = (row) => {
    setEditing({ ...row });
    setBarcodes([]);
    setNewBarcode("");
    setBarcodesLoading(true);
    listItemBarcodes(row.id)
      .then(({ data }) => setBarcodes(Array.isArray(data) ? data : []))
      .catch(() => setBarcodes([]))
      .finally(() => setBarcodesLoading(false));
  };

  const reloadBarcodesIntoRow = (itemId, list) => {
    const primary = list.find((b) => b.is_primary)?.barcode || list[0]?.barcode || null;
    setItems((prev) => prev.map((it) => it.id === itemId ? { ...it, barcode: primary, barcodes: list.map((b) => b.barcode) } : it));
  };

  const handleAddBarcode = async () => {
    const v = newBarcode.trim();
    if (!v) return;
    setAddingBarcode(true);
    try {
      await addItemBarcode(editing.id, v);
      const { data } = await listItemBarcodes(editing.id);
      setBarcodes(data);
      reloadBarcodesIntoRow(editing.id, data);
      setNewBarcode("");
      notify.success("Barcode added.");
    } catch (err) { notify.error(err.response?.data?.detail || "Failed to add barcode."); }
    finally { setAddingBarcode(false); }
  };

  const handleDeleteBarcode = async (barcodeId) => {
    try {
      await deleteItemBarcode(editing.id, barcodeId);
      const { data } = await listItemBarcodes(editing.id);
      setBarcodes(data);
      reloadBarcodesIntoRow(editing.id, data);
    } catch (err) { notify.error(err.response?.data?.detail || "Failed to delete barcode."); }
  };

  const handleSetPrimary = async (barcodeId) => {
    try {
      await setPrimaryBarcode(editing.id, barcodeId);
      const { data } = await listItemBarcodes(editing.id);
      setBarcodes(data);
      reloadBarcodesIntoRow(editing.id, data);
    } catch (err) { notify.error(err.response?.data?.detail || "Failed to set primary."); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        item_name: editing.item_name,
        category: editing.category, rack_number: editing.rack_number, shelf: editing.shelf,
      };
      const { data } = await updateItem(editing.id, payload);
      setItems((p) => p.map((it) => it.id === data.id ? { ...it, ...data, barcode: it.barcode, barcodes: it.barcodes } : it));
      notify.success("Product updated.");
      setEditing(null);
    } catch (err) { notify.error(err.response?.data?.detail || "Save failed."); }
    finally { setSaving(false); }
  };

  const columns = [
    { field: "item_code", headerName: "Item Code", flex: 0.8, minWidth: 110 },
    { field: "item_name", headerName: "Item Name", flex: 1.6, minWidth: 200 },
    {
      field: "barcode", headerName: "Barcode", flex: 0.9, minWidth: 140,
      renderCell: (p) => {
        const primary = p.row.barcode;
        const extra = (p.row.barcodes?.length || 0) - (primary ? 1 : 0);
        if (!primary) return "—";
        return (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography variant="body2" sx={{ fontFamily: "monospace" }}>{primary}</Typography>
            {extra > 0 && <Chip size="small" label={`+${extra}`} variant="outlined" />}
          </Stack>
        );
      },
    },
    { field: "category", headerName: "Category", flex: 0.8, minWidth: 110, valueGetter: (v) => v || "—" },
    { field: "rack_number", headerName: "Rack", flex: 0.5, minWidth: 80, valueGetter: (v) => v || "—" },
    { field: "shelf", headerName: "Shelf", flex: 0.5, minWidth: 80, valueGetter: (v) => v || "—" },
    ...(isAdmin ? [{ field: "outlet_name", headerName: "Outlet", flex: 0.9, minWidth: 130 }] : []),
    { field: "latest_cost_price", headerName: "Cost", type: "number", flex: 0.6, minWidth: 90, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { field: "latest_selling_price", headerName: "Sell", type: "number", flex: 0.6, minWidth: 90, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    {
      field: "status", headerName: "Status", flex: 0.7, minWidth: 110,
      renderCell: (p) => p.value === "active"
        ? <Chip size="small" label="Active" color="success" variant="outlined" />
        : <Chip size="small" label="Pending" color="warning" variant="outlined" />,
    },
    {
      field: "edit", headerName: "", width: 60, sortable: false, filterable: false,
      renderCell: (p) => (
        <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(p.row)}>
          <EditIcon fontSize="small" />
        </IconButton></Tooltip>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader
        title="Product Master"
        subtitle="Edit item details: name, barcode, category, rack, shelf"
        icon={<EditNoteIcon />}
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
            {isAdmin && outlets.length > 0 && (
              <TextField size="small" select value={selectedOutlet} onChange={(e) => { setSelectedOutlet(e.target.value); setPage(1); }} sx={{ minWidth: 160 }} label="Outlet">
                <MenuItem value="">All Outlets</MenuItem>
                {outlets.map((o) => <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>)}
              </TextField>
            )}
            {totalCount > 0 && <Typography variant="caption" color="text.secondary">{totalCount} products</Typography>}
          </Stack>
        }
      />

      <TextField fullWidth size="small" placeholder="Search by item code or name…" value={search} onChange={onSearchChange}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} sx={{ mb: 2 }} />

      <DataTable
        rows={items}
        columns={columns}
        loading={loading}
        paginationMode="server"
        rowCount={totalCount}
        paginationModel={{ page: page - 1, pageSize: PAGE_SIZE }}
        onPaginationModelChange={(m) => setPage(m.page + 1)}
        pageSizeOptions={[PAGE_SIZE]}
        emptyText="No products found"
        height={640}
      />

      <FormDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSubmit={handleSave}
        title={`Edit: ${editing?.item_code ?? ""}`}
        loading={saving}
      >
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Item Name" fullWidth value={editing?.item_name || ""} onChange={(e) => setEditing((f) => ({ ...f, item_name: e.target.value }))} />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Barcodes</Typography>
            {barcodesLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}><CircularProgress size={20} /></Box>
            ) : (
              <Stack spacing={0.75} sx={{ mb: 1 }}>
                {barcodes.length === 0 && <Typography variant="caption" color="text.secondary">No barcodes yet. Add one below.</Typography>}
                {barcodes.map((b) => (
                  <Stack key={b.id} direction="row" spacing={1} alignItems="center" sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, px: 1, py: 0.5 }}>
                    <Tooltip title={b.is_primary ? "Primary" : "Set as primary"}>
                      <IconButton size="small" onClick={() => !b.is_primary && handleSetPrimary(b.id)} color={b.is_primary ? "warning" : "default"}>
                        {b.is_primary ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                    <Typography variant="body2" sx={{ flex: 1, fontFamily: "monospace" }}>{b.barcode}</Typography>
                    {b.is_primary && <Chip size="small" label="Primary" color="warning" variant="outlined" />}
                    <Tooltip title="Remove">
                      <IconButton size="small" onClick={() => handleDeleteBarcode(b.id)}><DeleteIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </Stack>
                ))}
              </Stack>
            )}
            <Stack direction="row" spacing={1}>
              <TextField size="small" fullWidth placeholder="Add barcode…" value={newBarcode}
                onChange={(e) => setNewBarcode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddBarcode(); } }} />
              <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleAddBarcode} disabled={addingBarcode || !newBarcode.trim()}>Add</Button>
            </Stack>
          </Box>

          <Divider />

          <TextField label="Category" fullWidth value={editing?.category || ""} onChange={(e) => setEditing((f) => ({ ...f, category: e.target.value }))} />
          <Grid container spacing={1.5}>
            <Grid item xs={6}><TextField fullWidth label="Rack No." placeholder="R3" value={editing?.rack_number || ""} onChange={(e) => setEditing((f) => ({ ...f, rack_number: e.target.value }))} /></Grid>
            <Grid item xs={6}><TextField fullWidth label="Shelf" placeholder="S2" value={editing?.shelf || ""} onChange={(e) => setEditing((f) => ({ ...f, shelf: e.target.value }))} /></Grid>
          </Grid>
        </Stack>
      </FormDialog>
    </Layout>
  );
}
