import { useState } from "react";
import {
  Stack, TextField, Button, Typography, Paper, Box, IconButton,
  Alert, Divider,
} from "@mui/material";
import MoveToInboxIcon from "@mui/icons-material/MoveToInbox";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { searchProducts, submitGrnEntry, searchSuppliers } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

const toN = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function PosGrnEntryPage() {
  const { notify } = useNotification();
  const today = new Date().toISOString().slice(0, 10);
  const [supplier, setSupplier] = useState("");
  const [supplierId, setSupplierId] = useState(null);
  const [supplierCode, setSupplierCode] = useState("");
  const [supplierResults, setSupplierResults] = useState([]);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [receivedDate, setReceivedDate] = useState(today);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([]);
  const [itemSearch, setItemSearch] = useState("");
  const [results, setResults] = useState([]);
  const [saving, setSaving] = useState(false);

  const searchItem = async (q) => {
    setItemSearch(q);
    if (q.length < 2) { setResults([]); return; }
    try { const r = await searchProducts(q); setResults(r.data || []); } catch { /**/ }
  };

  const onSupplierChange = async (val) => {
    setSupplier(val); setSupplierId(null); setSupplierCode("");
    if (val.length < 2) { setSupplierResults([]); return; }
    try { const r = await searchSuppliers(val); setSupplierResults(r.data || []); } catch { /**/ }
  };
  const pickSupplier = (s) => {
    setSupplier(s.name); setSupplierId(s.id); setSupplierCode(s.code); setSupplierResults([]);
  };

  const addLine = (item) => {
    setLines((prev) => [
      ...prev,
      {
        key: Math.random().toString(36).slice(2),
        item_id: item.id,
        item_code: item.item_code,
        item_name: item.item_name,
        qty: 1, cost_price: "", sell_price: item.selling_price || "",
      },
    ]);
    setItemSearch(""); setResults([]);
  };

  const updateLine = (key, patch) => setLines(lines.map((l) => l.key === key ? { ...l, ...patch } : l));
  const removeLine = (key) => setLines(lines.filter((l) => l.key !== key));

  const total = lines.reduce((s, l) => s + toN(l.qty) * toN(l.cost_price), 0);

  const save = async () => {
    if (!lines.length) { notify("Add at least one item.", "warning"); return; }
    setSaving(true);
    try {
      const res = await submitGrnEntry({
        supplier_id: supplierId || undefined,
        supplier_code: supplierCode || undefined,
        supplier_name: supplier,
        invoice_no: invoiceNo, received_date: receivedDate, note,
        lines: lines.map((l) => ({
          item_id: l.item_id, qty: String(l.qty),
          cost_price: l.cost_price !== "" ? String(l.cost_price) : null,
          sell_price: l.sell_price !== "" ? String(l.sell_price) : null,
        })),
      });
      notify(`GRN saved: ${res.data.ref} · ${res.data.movements_created} movements · ${res.data.price_changes} price changes.`, "success");
      setLines([]); setSupplier(""); setSupplierId(null); setSupplierCode(""); setInvoiceNo(""); setNote("");
    } catch (err) {
      notify(err?.response?.data?.detail || "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <PageHeader title="GRN Entry" subtitle="Record goods received from a supplier" icon={<MoveToInboxIcon />} />
      <Paper sx={{ p: 3, maxWidth: 1000 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
          <Box sx={{ flex: 1, position: "relative" }}>
            <TextField fullWidth label="Supplier" value={supplier} onChange={(e) => onSupplierChange(e.target.value)}
              helperText={supplierCode ? `Linked: ${supplierCode}` : supplier ? "Will be created if new" : ""} />
            {supplierResults.length > 0 && (
              <Box sx={{ position: "absolute", zIndex: 20, left: 0, right: 0, bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: 1, maxHeight: 220, overflow: "auto", mt: 0.5 }}>
                {supplierResults.map((s) => (
                  <Box key={s.id} onClick={() => pickSupplier(s)}
                    sx={{ p: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" }, borderBottom: 1, borderColor: "divider" }}>
                    <Typography variant="body2" fontWeight={600}>{s.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{s.code} · {s.phone || "no phone"}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
          <TextField label="Invoice no." value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} sx={{ flex: 1 }} />
          <TextField type="date" label="Received date" InputLabelProps={{ shrink: true }}
            value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
        </Stack>
        <TextField label="Note" fullWidth multiline minRows={1} value={note} onChange={(e) => setNote(e.target.value)} sx={{ mb: 2 }} />

        <Divider sx={{ mb: 2 }} />
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Add items</Typography>
        <TextField fullWidth size="small" placeholder="Search item code / name / barcode…"
          value={itemSearch} onChange={(e) => searchItem(e.target.value)} />
        {results.length > 0 && (
          <Box sx={{ mt: 1, border: 1, borderColor: "divider", borderRadius: 1, maxHeight: 240, overflow: "auto" }}>
            {results.map((r) => (
              <Stack key={r.id} direction="row" alignItems="center" onClick={() => addLine(r)}
                sx={{ p: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" }, borderBottom: 1, borderColor: "divider" }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight={600}>{r.item_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.item_code} · on hand: {r.on_hand}</Typography>
                </Box>
                <Typography variant="body2">LKR {Number(r.selling_price).toFixed(2)}</Typography>
              </Stack>
            ))}
          </Box>
        )}

        <Divider sx={{ my: 2 }} />
        {lines.length === 0 ? (
          <Alert severity="info">No items yet — search above and click to add.</Alert>
        ) : (
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}>
            {lines.map((l) => (
              <Stack key={l.key} direction={{ xs: "column", md: "row" }} spacing={1} alignItems="center" sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
                <Box sx={{ flex: 1, minWidth: 200 }}>
                  <Typography variant="body2" fontWeight={600}>{l.item_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{l.item_code}</Typography>
                </Box>
                <TextField size="small" label="Qty" value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} sx={{ width: 100 }} inputProps={{ inputMode: "decimal" }} />
                <TextField size="small" label="Cost price" value={l.cost_price} onChange={(e) => updateLine(l.key, { cost_price: e.target.value })} sx={{ width: 120 }} inputProps={{ inputMode: "decimal" }} />
                <TextField size="small" label="New sell price" value={l.sell_price} onChange={(e) => updateLine(l.key, { sell_price: e.target.value })} sx={{ width: 140 }} inputProps={{ inputMode: "decimal" }} helperText="Leave blank to keep" />
                <Typography variant="body2" fontWeight={600} sx={{ width: 100, textAlign: "right" }}>
                  {(toN(l.qty) * toN(l.cost_price)).toFixed(2)}
                </Typography>
                <IconButton size="small" color="error" onClick={() => removeLine(l.key)}><DeleteIcon fontSize="small" /></IconButton>
              </Stack>
            ))}
            <Stack direction="row" sx={{ p: 1.5, bgcolor: "action.hover" }}>
              <Typography sx={{ flex: 1 }} fontWeight={700}>Total cost</Typography>
              <Typography fontWeight={700}>LKR {total.toFixed(2)}</Typography>
            </Stack>
          </Box>
        )}

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving || !lines.length}>
            Save GRN
          </Button>
          <Button variant="outlined" onClick={() => setLines([])} disabled={!lines.length}>Clear</Button>
        </Stack>
      </Paper>
    </Layout>
  );
}
