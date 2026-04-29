import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, Typography, InputAdornment, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, Box, Alert,
  MenuItem, Checkbox, FormControlLabel, IconButton,
} from "@mui/material";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { listProducts, createProduct, updateProduct, deleteProduct, importProductsCsv, listUnits } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

const empty = () => ({
  item_code: "", item_name: "", barcode: "", category: "",
  sell_price: "0", cost_price: "0", tax_rate_pct: "0",
  on_hand: "0", reorder_level: "0",
  base_unit_code: "", is_weighed: false, weighed_barcode_prefix: "",
  pack_units: [],
  pack_unit_code: "", pack_size: "0", pack_sell_price: "0", plu_code: "",
});

export default function PosProductsPage() {
  const { notify } = useNotification();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty());
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [units, setUnits] = useState([]);
  const PAGE_SIZE = 50;

  useEffect(() => {
    listUnits().then((r) => setUnits(r.data?.results || [])).catch(() => setUnits([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listProducts({ q: search || undefined, page, page_size: PAGE_SIZE });
      setData(res.data);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    } finally { setLoading(false); }
  }, [search, page, notify]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search]);

  const openCreate = () => { setEditing(null); setForm(empty()); setEditOpen(true); };
  const openEdit = (p) => { setEditing(p); setForm({ ...empty(), ...p }); setEditOpen(true); };
  const save = async () => {
    try {
      if (editing) await updateProduct(editing.id, form); else await createProduct(form);
      notify(editing ? "Product updated." : "Product created.", "success");
      setEditOpen(false); load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Save failed.", "error");
    }
  };
  const remove = async (p) => {
    if (!window.confirm(`Deactivate ${p.item_name}?`)) return;
    try { await deleteProduct(p.id); load(); } catch { notify("Failed.", "error"); }
  };
  const doImport = async () => {
    if (!importFile) return;
    try {
      const r = await importProductsCsv(importFile);
      setImportResult(r.data);
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Import failed.", "error");
    }
  };

  const cols = [
    { field: "item_code", headerName: "Code", flex: 0.6, minWidth: 100 },
    { field: "item_name", headerName: "Name", flex: 1.4, minWidth: 200 },
    { field: "barcode", headerName: "Barcode", flex: 0.8, minWidth: 110, valueGetter: (v) => v || "—" },
    { field: "category", headerName: "Category", flex: 0.8, minWidth: 110, valueGetter: (v) => v || "—" },
    { field: "sell_price", headerName: "Sell", flex: 0.5, minWidth: 80, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "cost_price", headerName: "Cost", flex: 0.5, minWidth: 80, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "on_hand", headerName: "On Hand", flex: 0.6, minWidth: 90,
      renderCell: (p) => {
        const v = Number(p.value); const r = Number(p.row.reorder_level);
        return <span style={{ color: r > 0 && v < r ? "#d32f2f" : "inherit", fontWeight: 600 }}>{v.toFixed(3).replace(/\.?0+$/, "")}</span>;
      } },
    { field: "reorder_level", headerName: "Reorder", flex: 0.5, minWidth: 80,
      valueGetter: (v) => Number(v).toFixed(3).replace(/\.?0+$/, "") },
    { field: "tax_rate_pct", headerName: "Tax %", flex: 0.4, minWidth: 70, valueGetter: (v) => Number(v).toFixed(2) },
    {
      field: "_actions", headerName: "", flex: 0.6, minWidth: 130, sortable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5}>
          <Button size="small" onClick={() => openEdit(p.row)}>Edit</Button>
          <Button size="small" color="warning" onClick={() => remove(p.row)}>Off</Button>
        </Stack>
      ),
    },
  ];

  const setF = (k, v) => setForm({ ...form, [k]: v });

  return (
    <Layout>
      <PageHeader title="Products" subtitle="Catalog — sell price, cost, on-hand, reorder" icon={<Inventory2Icon />} />

      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" placeholder="Search code / name / barcode" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
        <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => { setImportOpen(true); setImportResult(null); setImportFile(null); }}>Import CSV</Button>
        <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={openCreate}>Add product</Button>
      </Stack>

      <Typography variant="caption" color="text.secondary">{data?.count || 0} products</Typography>
      <DataTable
        rows={data?.results ?? []} columns={cols} loading={loading} getRowId={(r) => r.id}
        paginationMode="server" rowCount={data?.count ?? 0}
        paginationModel={{ page: page - 1, pageSize: PAGE_SIZE }}
        onPaginationModelChange={(m) => setPage(m.page + 1)}
        pageSizeOptions={[PAGE_SIZE]} emptyText="No products" height={600}
      />

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={2}>
              <TextField label="Item code" value={form.item_code} onChange={(e) => setF("item_code", e.target.value)} disabled={!!editing} sx={{ flex: 1 }} required />
              <TextField label="Barcode" value={form.barcode} onChange={(e) => setF("barcode", e.target.value)} sx={{ flex: 1 }} />
            </Stack>
            <TextField label="Item name" value={form.item_name} onChange={(e) => setF("item_name", e.target.value)} required />
            <TextField label="Category" value={form.category} onChange={(e) => setF("category", e.target.value)} />
            <Stack direction="row" spacing={2}>
              <TextField label="Sell price" value={form.sell_price} onChange={(e) => setF("sell_price", e.target.value)} sx={{ flex: 1 }} inputProps={{ inputMode: "decimal" }} />
              <TextField label="Cost price" value={form.cost_price} onChange={(e) => setF("cost_price", e.target.value)} sx={{ flex: 1 }} inputProps={{ inputMode: "decimal" }} />
              <TextField label="Tax %" value={form.tax_rate_pct} onChange={(e) => setF("tax_rate_pct", e.target.value)} sx={{ width: 110 }} inputProps={{ inputMode: "decimal" }} />
            </Stack>
            <Stack direction="row" spacing={2}>
              {!editing && (
                <TextField label="Opening stock" value={form.on_hand} onChange={(e) => setF("on_hand", e.target.value)} sx={{ flex: 1 }} inputProps={{ inputMode: "decimal" }} />
              )}
              <TextField label="Reorder level" value={form.reorder_level} onChange={(e) => setF("reorder_level", e.target.value)} sx={{ flex: 1 }} inputProps={{ inputMode: "decimal" }} />
            </Stack>
            {editing && (
              <Alert severity="info">On-hand shown: <b>{editing.on_hand}</b>. To adjust, use Stock → Adjust Stock (keeps full audit).</Alert>
            )}

            <Stack direction="row" spacing={2} alignItems="center">
              <TextField select label="Base unit" value={form.base_unit_code || ""} onChange={(e) => setF("base_unit_code", e.target.value)} sx={{ flex: 1 }}>
                <MenuItem value="">—</MenuItem>
                {units.map((u) => <MenuItem key={u.id} value={u.code}>{u.code} — {u.name}</MenuItem>)}
              </TextField>
              <FormControlLabel
                control={<Checkbox checked={!!form.is_weighed} onChange={(e) => setF("is_weighed", e.target.checked)} />}
                label="Sold by weight"
              />
              <TextField label="Weighed PLU (5 digit)" value={form.weighed_barcode_prefix || form.plu_code || ""}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 5);
                  setForm({ ...form, weighed_barcode_prefix: v, plu_code: v });
                }}
                disabled={!form.is_weighed}
                sx={{ width: 160 }} inputProps={{ maxLength: 5 }} />
            </Stack>

            <Stack direction="row" spacing={2} alignItems="center">
              <TextField select label="Pack unit" value={form.pack_unit_code || ""}
                onChange={(e) => setF("pack_unit_code", e.target.value)} sx={{ flex: 1 }}>
                <MenuItem value="">—</MenuItem>
                {units.map((u) => <MenuItem key={u.id} value={u.code}>{u.code} — {u.name}</MenuItem>)}
              </TextField>
              <TextField label="Pack size (× base)" value={form.pack_size || "0"}
                onChange={(e) => setF("pack_size", e.target.value)}
                sx={{ flex: 1 }} inputProps={{ inputMode: "decimal" }} />
              <TextField label="Pack sell price (0 = compute)" value={form.pack_sell_price || "0"}
                onChange={(e) => setF("pack_sell_price", e.target.value)}
                sx={{ flex: 1 }} inputProps={{ inputMode: "decimal" }} />
            </Stack>

            <Box>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="subtitle2" sx={{ flex: 1 }}>Pack units</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setF("pack_units", [...(form.pack_units || []), { unit_code: "", conversion_factor: "1", sell_price: "", barcode: "", is_default: false }])}>
                  Add pack unit
                </Button>
              </Stack>
              {(form.pack_units || []).length === 0 ? (
                <Typography variant="caption" color="text.secondary">
                  None — item is sold only in its base unit.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {(form.pack_units || []).map((pu, i) => (
                    <Stack key={i} direction="row" spacing={1} alignItems="center">
                      <TextField select size="small" label="Unit" value={pu.unit_code || ""} sx={{ minWidth: 120 }}
                        onChange={(e) => {
                          const next = [...form.pack_units];
                          next[i] = { ...next[i], unit_code: e.target.value };
                          setF("pack_units", next);
                        }}>
                        {units.map((u) => <MenuItem key={u.id} value={u.code}>{u.code}</MenuItem>)}
                      </TextField>
                      <TextField size="small" label="× base" value={pu.conversion_factor || ""} sx={{ width: 90 }} inputProps={{ inputMode: "decimal" }}
                        onChange={(e) => { const next = [...form.pack_units]; next[i] = { ...next[i], conversion_factor: e.target.value }; setF("pack_units", next); }} />
                      <TextField size="small" label="Pack price" value={pu.sell_price || ""} sx={{ width: 110 }} inputProps={{ inputMode: "decimal" }}
                        onChange={(e) => { const next = [...form.pack_units]; next[i] = { ...next[i], sell_price: e.target.value }; setF("pack_units", next); }} />
                      <TextField size="small" label="Barcode" value={pu.barcode || ""} sx={{ flex: 1 }}
                        onChange={(e) => { const next = [...form.pack_units]; next[i] = { ...next[i], barcode: e.target.value }; setF("pack_units", next); }} />
                      <FormControlLabel
                        control={<Checkbox checked={!!pu.is_default} onChange={(e) => { const next = form.pack_units.map((x, j) => ({ ...x, is_default: j === i ? e.target.checked : false })); setF("pack_units", next); }} />}
                        label="Default" />
                      <IconButton size="small" color="error"
                        onClick={() => setF("pack_units", form.pack_units.filter((_, j) => j !== i))}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={!form.item_code || !form.item_name}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={importOpen} onClose={() => setImportOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Import products (CSV)</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">
              CSV columns: <code>item_code, item_name, barcode, category, cost_price, sell_price, tax_rate_pct, on_hand, reorder_level</code>.
              Matching existing <code>item_code</code> updates the row; unknown codes are created.
            </Alert>
            <Button component="label" variant="outlined">
              {importFile ? importFile.name : "Choose CSV file"}
              <input type="file" accept=".csv,text/csv" hidden onChange={(e) => setImportFile(e.target.files[0])} />
            </Button>
            {importResult && (
              <Alert severity="success">
                Created: {importResult.created} · Updated: {importResult.updated} · Errors: {importResult.errors?.length || 0}
              </Alert>
            )}
            {importResult?.errors?.length > 0 && (
              <Box sx={{ fontFamily: "monospace", fontSize: 12, maxHeight: 200, overflow: "auto", bgcolor: "action.hover", p: 1, borderRadius: 1 }}>
                {importResult.errors.map((e, i) => <div key={i}>Row {e.row}: {e.error}</div>)}
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportOpen(false)}>Close</Button>
          <Button variant="contained" onClick={doImport} disabled={!importFile}>Upload</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
