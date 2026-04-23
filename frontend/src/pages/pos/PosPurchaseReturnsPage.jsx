import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, Typography, IconButton, Box, Alert, Paper, Divider,
} from "@mui/material";
import KeyboardReturnIcon from "@mui/icons-material/KeyboardReturn";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { listPurchaseReturns, createPurchaseReturn, searchProducts, searchSuppliers } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

const toN = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function PosPurchaseReturnsPage() {
  const { notify } = useNotification();
  const today = new Date().toISOString().slice(0, 10);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [supplier, setSupplier] = useState("");
  const [supplierId, setSupplierId] = useState(null);
  const [supplierCode, setSupplierCode] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [returnDate, setReturnDate] = useState(today);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([]);
  const [itemSearch, setItemSearch] = useState("");
  const [itemResults, setItemResults] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await listPurchaseReturns(); setRows(r.data.results || []); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const pickSupplier = (s) => { setSupplier(s.name); setSupplierId(s.id); setSupplierCode(s.code); setSuppliers([]); };
  const supplierChange = async (v) => {
    setSupplier(v); setSupplierId(null); setSupplierCode("");
    if (v.length < 2) { setSuppliers([]); return; }
    try { const r = await searchSuppliers(v); setSuppliers(r.data || []); } catch { /**/ }
  };

  const itemSearchChange = async (v) => {
    setItemSearch(v);
    if (v.length < 2) { setItemResults([]); return; }
    try { const r = await searchProducts(v); setItemResults(r.data || []); } catch { /**/ }
  };
  const addLine = (it) => {
    setLines((prev) => [...prev, {
      key: Math.random().toString(36).slice(2),
      item_id: it.id, item_code: it.item_code, item_name: it.item_name,
      qty: 1, unit_cost: "0",
    }]);
    setItemSearch(""); setItemResults([]);
  };
  const updateLine = (key, patch) => setLines(lines.map((l) => l.key === key ? { ...l, ...patch } : l));
  const removeLine = (key) => setLines(lines.filter((l) => l.key !== key));
  const total = lines.reduce((s, l) => s + toN(l.qty) * toN(l.unit_cost), 0);

  const save = async () => {
    if (!lines.length) return;
    setSaving(true);
    try {
      const r = await createPurchaseReturn({
        supplier_id: supplierId || undefined,
        supplier_code: supplierCode || undefined,
        supplier_name: supplier,
        original_invoice_no: invoiceNo, returned_on: returnDate, note,
        lines: lines.map((l) => ({ item_id: l.item_id, qty: String(l.qty), unit_cost: String(l.unit_cost) })),
      });
      notify(`RTS ${r.data.ref_no} saved. Total LKR ${Number(r.data.total_amount).toFixed(2)}`, "success");
      setLines([]); setSupplier(""); setSupplierId(null); setSupplierCode(""); setInvoiceNo(""); setNote("");
      load();
    } catch (err) { notify(err?.response?.data?.detail || "Failed.", "error"); }
    finally { setSaving(false); }
  };

  const cols = [
    { field: "ref_no", headerName: "Ref", flex: 0.8, minWidth: 130 },
    { field: "returned_on", headerName: "Date", flex: 0.6, minWidth: 110 },
    { field: "supplier_name", headerName: "Supplier", flex: 1.2, minWidth: 150, valueGetter: (v) => v || "—" },
    { field: "original_invoice_no", headerName: "Invoice", flex: 0.8, minWidth: 120, valueGetter: (v) => v || "—" },
    { field: "total_amount", headerName: "Total", flex: 0.6, minWidth: 110,
      renderCell: (p) => <b>{Number(p.value).toFixed(2)}</b> },
    { field: "status", headerName: "Status", flex: 0.5, minWidth: 80 },
    { field: "created_by", headerName: "By", flex: 0.5, minWidth: 90, valueGetter: (v) => v || "—" },
  ];

  return (
    <Layout>
      <PageHeader title="Purchase Returns" subtitle="Return goods to supplier (stock-out + payable adjust)" icon={<KeyboardReturnIcon />} />

      <Paper sx={{ p: 3, mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>New return</Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
          <Box sx={{ flex: 1, position: "relative" }}>
            <TextField fullWidth label="Supplier" value={supplier} onChange={(e) => supplierChange(e.target.value)}
              helperText={supplierCode ? `Linked: ${supplierCode}` : ""} />
            {suppliers.length > 0 && (
              <Box sx={{ position: "absolute", zIndex: 20, left: 0, right: 0, bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: 1, maxHeight: 220, overflow: "auto", mt: 0.5 }}>
                {suppliers.map((s) => (
                  <Box key={s.id} sx={{ p: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }} onClick={() => pickSupplier(s)}>
                    <Typography variant="body2" fontWeight={600}>{s.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{s.code}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
          <TextField label="Original invoice no." value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} sx={{ flex: 1 }} />
          <TextField type="date" label="Return date" InputLabelProps={{ shrink: true }} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
        </Stack>
        <TextField fullWidth label="Note" value={note} onChange={(e) => setNote(e.target.value)} sx={{ mb: 2 }} />
        <Divider sx={{ mb: 2 }} />

        <TextField fullWidth size="small" placeholder="Search item to add…" value={itemSearch} onChange={(e) => itemSearchChange(e.target.value)} />
        {itemResults.length > 0 && (
          <Box sx={{ mt: 1, border: 1, borderColor: "divider", borderRadius: 1, maxHeight: 240, overflow: "auto" }}>
            {itemResults.map((r) => (
              <Stack key={r.id} direction="row" alignItems="center" onClick={() => addLine(r)}
                sx={{ p: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" }, borderBottom: 1, borderColor: "divider" }}>
                <Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={600}>{r.item_name}</Typography><Typography variant="caption">{r.item_code} · on hand: {r.on_hand}</Typography></Box>
              </Stack>
            ))}
          </Box>
        )}

        {lines.length === 0 ? (
          <Alert severity="info" sx={{ mt: 2 }}>Search and add items.</Alert>
        ) : (
          <Box sx={{ mt: 2, border: 1, borderColor: "divider", borderRadius: 1 }}>
            {lines.map((l) => (
              <Stack key={l.key} direction="row" spacing={1} alignItems="center" sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight={600}>{l.item_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{l.item_code}</Typography>
                </Box>
                <TextField size="small" label="Qty" value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} sx={{ width: 100 }} inputProps={{ inputMode: "decimal" }} />
                <TextField size="small" label="Unit cost" value={l.unit_cost} onChange={(e) => updateLine(l.key, { unit_cost: e.target.value })} sx={{ width: 120 }} inputProps={{ inputMode: "decimal" }} />
                <Typography sx={{ width: 100, textAlign: "right" }} fontWeight={600}>{(toN(l.qty) * toN(l.unit_cost)).toFixed(2)}</Typography>
                <IconButton size="small" color="error" onClick={() => removeLine(l.key)}><DeleteIcon fontSize="small" /></IconButton>
              </Stack>
            ))}
            <Stack direction="row" sx={{ p: 1, bgcolor: "action.hover" }}>
              <Typography sx={{ flex: 1 }} fontWeight={700}>Total</Typography>
              <Typography fontWeight={700}>LKR {total.toFixed(2)}</Typography>
            </Stack>
          </Box>
        )}

        <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving || !lines.length} sx={{ mt: 2 }}>Save RTS</Button>
      </Paper>

      <Stack direction="row" spacing={1.5} sx={{ mb: 2, mt: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>Recent returns</Typography>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </Stack>
      <DataTable rows={rows} columns={cols} loading={loading} getRowId={(r) => r.id} height={420} emptyText="No returns yet" />
    </Layout>
  );
}
