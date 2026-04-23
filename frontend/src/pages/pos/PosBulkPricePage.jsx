import { useState } from "react";
import {
  Stack, TextField, Button, Typography, Paper, Box, IconButton, Alert,
} from "@mui/material";
import PriceChangeIcon from "@mui/icons-material/PriceChange";
import SaveIcon from "@mui/icons-material/Save";
import DeleteIcon from "@mui/icons-material/Delete";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { searchProducts, bulkPriceUpdate } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

export default function PosBulkPricePage() {
  const { notify } = useNotification();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [bulkPct, setBulkPct] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const addRow = (item) => {
    if (rows.some((r) => r.item_id === item.id)) return;
    setRows((prev) => [
      ...prev,
      { key: Math.random().toString(36).slice(2), item_id: item.id, item_code: item.item_code, item_name: item.item_name,
        current_sell: item.selling_price || "0", new_sell: item.selling_price || "" },
    ]);
    setSearch(""); setResults([]);
  };

  const doSearch = async (q) => {
    setSearch(q);
    if (q.length < 2) { setResults([]); return; }
    try { const r = await searchProducts(q); setResults(r.data || []); } catch { /**/ }
  };

  const applyPct = () => {
    const pct = Number(bulkPct);
    if (!Number.isFinite(pct) || pct === 0) return;
    setRows(rows.map((r) => ({
      ...r,
      new_sell: (Number(r.current_sell || 0) * (1 + pct / 100)).toFixed(2),
    })));
  };

  const save = async () => {
    const updates = rows.filter((r) => r.new_sell !== "" && Number(r.new_sell) !== Number(r.current_sell))
      .map((r) => ({ item_id: r.item_id, new_sell: r.new_sell }));
    if (!updates.length) { notify("No prices changed.", "warning"); return; }
    setSaving(true);
    try {
      const res = await bulkPriceUpdate(updates, note);
      notify(`Updated ${res.data.updated} of ${res.data.submitted} items.`, "success");
      setRows([]); setNote("");
    } catch (err) {
      notify(err?.response?.data?.detail || "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <PageHeader title="Bulk Price Update" subtitle="Change sell prices for many items at once" icon={<PriceChangeIcon />} />
      <Paper sx={{ p: 3, maxWidth: 1100 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }} alignItems="center">
          <TextField fullWidth size="small" placeholder="Search + click to add item" value={search} onChange={(e) => doSearch(e.target.value)} />
          <TextField size="small" label="Apply % to all" type="number" value={bulkPct} onChange={(e) => setBulkPct(e.target.value)} sx={{ width: 150 }} helperText="+10, -5 etc." />
          <Button variant="outlined" onClick={applyPct} disabled={!rows.length || !bulkPct}>Apply %</Button>
        </Stack>

        {results.length > 0 && (
          <Box sx={{ mb: 2, border: 1, borderColor: "divider", borderRadius: 1, maxHeight: 240, overflow: "auto" }}>
            {results.map((r) => (
              <Stack key={r.id} direction="row" alignItems="center" onClick={() => addRow(r)}
                sx={{ p: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" }, borderBottom: 1, borderColor: "divider" }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight={600}>{r.item_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.item_code}</Typography>
                </Box>
                <Typography variant="body2">LKR {Number(r.selling_price).toFixed(2)}</Typography>
              </Stack>
            ))}
          </Box>
        )}

        {rows.length === 0 ? (
          <Alert severity="info">Search and add items above.</Alert>
        ) : (
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}>
            <Stack direction="row" sx={{ p: 1, bgcolor: "action.hover", fontWeight: 600, fontSize: 13 }}>
              <Box sx={{ flex: 1 }}>Item</Box>
              <Box sx={{ width: 120, textAlign: "right" }}>Current</Box>
              <Box sx={{ width: 140, textAlign: "right" }}>New sell</Box>
              <Box sx={{ width: 100, textAlign: "right" }}>Δ</Box>
              <Box sx={{ width: 40 }} />
            </Stack>
            {rows.map((r) => {
              const delta = Number(r.new_sell || 0) - Number(r.current_sell || 0);
              return (
                <Stack key={r.key} direction="row" alignItems="center" sx={{ p: 1, borderTop: 1, borderColor: "divider" }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600}>{r.item_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{r.item_code}</Typography>
                  </Box>
                  <Box sx={{ width: 120, textAlign: "right" }}>{Number(r.current_sell).toFixed(2)}</Box>
                  <Box sx={{ width: 140 }}>
                    <TextField size="small" value={r.new_sell}
                      onChange={(e) => setRows(rows.map((x) => x.key === r.key ? { ...x, new_sell: e.target.value } : x))}
                      inputProps={{ inputMode: "decimal", style: { textAlign: "right" } }} />
                  </Box>
                  <Box sx={{ width: 100, textAlign: "right", color: delta === 0 ? "inherit" : (delta > 0 ? "#2e7d32" : "#d32f2f"), fontWeight: 600 }}>
                    {delta > 0 ? "+" : ""}{delta.toFixed(2)}
                  </Box>
                  <Box sx={{ width: 40 }}>
                    <IconButton size="small" color="error" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}><DeleteIcon fontSize="small" /></IconButton>
                  </Box>
                </Stack>
              );
            })}
          </Box>
        )}

        <TextField label="Note" fullWidth value={note} onChange={(e) => setNote(e.target.value)} sx={{ mt: 2 }} />
        <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving || !rows.length} sx={{ mt: 2 }}>
          Save {rows.length > 0 ? `(${rows.length} item${rows.length > 1 ? "s" : ""})` : ""}
        </Button>
      </Paper>
    </Layout>
  );
}
