import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, Chip, Typography, MenuItem, Box,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { listPromotions, createPromotion, updatePromotion, deletePromotion, searchProducts } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

const dtLocal = (d) => {
  if (!d) return "";
  const dt = new Date(d); const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

const emptyForm = () => ({
  name: "", code: "", kind: "percent", value: "", scope: "bill",
  item: null, item_label: "", category: "", min_bill_amount: "0",
  starts_at: dtLocal(new Date()),
  ends_at: dtLocal(new Date(Date.now() + 14 * 864e5)),
  max_usage: 0, is_active: true,
});

export default function PosPromotionsPage() {
  const { notify } = useNotification();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [itemSearch, setItemSearch] = useState("");
  const [itemResults, setItemResults] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listPromotions();
      setRows(r.data.results || []);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    } finally { setLoading(false); }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setEditOpen(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({
      name: p.name || "", code: p.code || "",
      kind: p.kind, value: String(p.value),
      scope: p.scope, item: p.item, item_label: p.item_name ? `${p.item_code} — ${p.item_name}` : "",
      category: p.category || "",
      min_bill_amount: String(p.min_bill_amount || 0),
      starts_at: dtLocal(p.starts_at), ends_at: dtLocal(p.ends_at),
      max_usage: p.max_usage, is_active: p.is_active,
    });
    setEditOpen(true);
  };

  const pickItem = async (q) => {
    setItemSearch(q);
    if (q.length < 2) { setItemResults([]); return; }
    try { const r = await searchProducts(q); setItemResults(r.data || []); } catch { /**/ }
  };

  const save = async () => {
    const payload = {
      name: form.name, code: form.code, kind: form.kind,
      value: form.value, scope: form.scope,
      item: form.scope === "item" ? form.item : null,
      category: form.scope === "category" ? form.category : "",
      min_bill_amount: form.min_bill_amount,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
      max_usage: Number(form.max_usage) || 0,
      is_active: !!form.is_active,
    };
    try {
      if (editing) await updatePromotion(editing.id, payload);
      else await createPromotion(payload);
      notify("Promotion saved.", "success");
      setEditOpen(false); load();
    } catch (err) {
      notify(err?.response?.data?.detail || JSON.stringify(err?.response?.data) || "Failed.", "error");
    }
  };

  const remove = async (p) => {
    if (!window.confirm(`Deactivate ${p.name}?`)) return;
    try { await deletePromotion(p.id); load(); } catch { notify("Failed.", "error"); }
  };

  const cols = [
    { field: "name", headerName: "Name", flex: 1.2, minWidth: 150 },
    { field: "kind", headerName: "Kind", flex: 0.5, minWidth: 80,
      renderCell: (p) => <Chip size="small" label={p.value === "percent" ? "%" : "LKR"} /> },
    { field: "value", headerName: "Value", flex: 0.5, minWidth: 80, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "scope", headerName: "Scope", flex: 0.6, minWidth: 90 },
    { field: "_target", headerName: "Target", flex: 1, minWidth: 150,
      valueGetter: (_, r) => r.scope === "item" ? (r.item_name || "—") : r.scope === "category" ? r.category : "Whole bill" },
    { field: "starts_at", headerName: "Starts", flex: 0.8, minWidth: 140, valueGetter: (v) => new Date(v).toLocaleString() },
    { field: "ends_at", headerName: "Ends", flex: 0.8, minWidth: 140, valueGetter: (v) => new Date(v).toLocaleString() },
    { field: "usage_count", headerName: "Used", flex: 0.5, minWidth: 80, type: "number",
      valueGetter: (_, r) => r.max_usage ? `${r.usage_count} / ${r.max_usage}` : r.usage_count },
    { field: "is_active", headerName: "Active", flex: 0.4, minWidth: 70,
      renderCell: (p) => <Chip size="small" label={p.value ? "✓" : "✗"} color={p.value ? "success" : "default"} /> },
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

  return (
    <Layout>
      <PageHeader title="POS Promotions" subtitle="Discounts by item, category, or whole bill" icon={<LocalOfferIcon />} />
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
        <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={openCreate}>New promotion</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">{rows.length} promotion{rows.length !== 1 ? "s" : ""}</Typography>
      <DataTable rows={rows} columns={cols} loading={loading} getRowId={(r) => r.id} height={600} emptyText="No promotions" />

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? "Edit promotion" : "New promotion"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <TextField label="Code (optional)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            <Stack direction="row" spacing={2}>
              <TextField select label="Kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} sx={{ flex: 1 }}>
                <MenuItem value="percent">% off</MenuItem>
                <MenuItem value="amount">LKR off</MenuItem>
              </TextField>
              <TextField label="Value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} sx={{ flex: 1 }} inputProps={{ inputMode: "decimal" }} />
            </Stack>
            <TextField select label="Scope" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
              <MenuItem value="bill">Whole bill</MenuItem>
              <MenuItem value="item">Single item</MenuItem>
              <MenuItem value="category">Category</MenuItem>
            </TextField>
            {form.scope === "item" && (
              <Box sx={{ position: "relative" }}>
                <TextField fullWidth label="Item" value={form.item_label || itemSearch}
                  onChange={(e) => { pickItem(e.target.value); setForm({ ...form, item_label: "" }); }}
                  helperText={form.item ? `Linked item id ${form.item}` : "Search and click"} />
                {itemResults.length > 0 && (
                  <Box sx={{ position: "absolute", zIndex: 20, left: 0, right: 0, bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: 1, maxHeight: 200, overflow: "auto", mt: 0.5 }}>
                    {itemResults.map((r) => (
                      <Box key={r.id} sx={{ p: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
                        onClick={() => { setForm({ ...form, item: r.id, item_label: `${r.item_code} — ${r.item_name}` }); setItemSearch(""); setItemResults([]); }}>
                        <Typography variant="body2" fontWeight={600}>{r.item_name}</Typography>
                        <Typography variant="caption" color="text.secondary">{r.item_code}</Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            )}
            {form.scope === "category" && (
              <TextField label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            )}
            <TextField label="Min bill amount" value={form.min_bill_amount} onChange={(e) => setForm({ ...form, min_bill_amount: e.target.value })} />
            <Stack direction="row" spacing={2}>
              <TextField type="datetime-local" label="Starts" InputLabelProps={{ shrink: true }} value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })} sx={{ flex: 1 }} />
              <TextField type="datetime-local" label="Ends" InputLabelProps={{ shrink: true }} value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })} sx={{ flex: 1 }} />
            </Stack>
            <TextField type="number" label="Max usage (0 = unlimited)" value={form.max_usage}
              onChange={(e) => setForm({ ...form, max_usage: e.target.value })} />
            <TextField select label="Active" value={form.is_active ? "1" : "0"}
              onChange={(e) => setForm({ ...form, is_active: e.target.value === "1" })}>
              <MenuItem value="1">Yes</MenuItem>
              <MenuItem value="0">No</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save}
            disabled={!form.name || !form.value || (form.scope === "item" && !form.item) || (form.scope === "category" && !form.category)}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
