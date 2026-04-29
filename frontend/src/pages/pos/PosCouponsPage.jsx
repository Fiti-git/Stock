import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, Chip, Typography, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { listCoupons, createCoupon, patchCoupon, deleteCoupon } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

const dtLocal = (d) => {
  if (!d) return "";
  const dt = new Date(d); const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

const emptyForm = () => ({
  code: "",
  discount_kind: "percent",
  value: "",
  min_bill_amount: "0",
  one_time: false,
  per_customer_limit: 0,
  max_usage: 0,
  starts_at: dtLocal(new Date()),
  ends_at: dtLocal(new Date(Date.now() + 30 * 864e5)),
  is_active: true,
});

export default function PosCouponsPage() {
  const { notify } = useNotification();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listCoupons();
      setRows(r.data.results || r.data || []);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    } finally { setLoading(false); }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setEditOpen(true); };
  const openEdit = (c) => {
    setEditing(c);
    setForm({
      code: c.code || "",
      discount_kind: c.discount_kind || "percent",
      value: String(c.value ?? ""),
      min_bill_amount: String(c.min_bill_amount ?? "0"),
      one_time: !!c.one_time,
      per_customer_limit: c.per_customer_limit || 0,
      max_usage: c.max_usage || 0,
      starts_at: dtLocal(c.starts_at),
      ends_at: dtLocal(c.ends_at),
      is_active: !!c.is_active,
    });
    setEditOpen(true);
  };

  const save = async () => {
    const payload = {
      code: form.code,
      discount_kind: form.discount_kind,
      value: form.value,
      min_bill_amount: form.min_bill_amount,
      one_time: !!form.one_time,
      per_customer_limit: Number(form.per_customer_limit) || 0,
      max_usage: Number(form.max_usage) || 0,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      is_active: !!form.is_active,
    };
    try {
      if (editing) await patchCoupon(editing.id, payload);
      else await createCoupon(payload);
      notify("Coupon saved.", "success");
      setEditOpen(false); load();
    } catch (err) {
      notify(err?.response?.data?.detail || JSON.stringify(err?.response?.data) || "Failed.", "error");
    }
  };

  const softDelete = async (c) => {
    if (!window.confirm(`Deactivate coupon ${c.code}?`)) return;
    try {
      // Soft delete: PATCH is_active=false. Fall back to DELETE if backend allows.
      await patchCoupon(c.id, { is_active: false });
      load();
    } catch {
      try { await deleteCoupon(c.id); load(); } catch { notify("Failed.", "error"); }
    }
  };

  const cols = [
    { field: "code", headerName: "Code", flex: 1, minWidth: 120 },
    { field: "discount_kind", headerName: "Kind", flex: 0.5, minWidth: 80,
      renderCell: (p) => <Chip size="small" label={p.value === "percent" ? "%" : "LKR"} /> },
    { field: "value", headerName: "Value", flex: 0.5, minWidth: 80, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "min_bill_amount", headerName: "Min bill", flex: 0.6, minWidth: 100, valueGetter: (v) => Number(v || 0).toFixed(2) },
    { field: "_usage", headerName: "Usage", flex: 0.6, minWidth: 100,
      valueGetter: (_, r) => r.max_usage ? `${r.usage_count || 0} / ${r.max_usage}` : (r.usage_count || 0) },
    { field: "starts_at", headerName: "Starts", flex: 0.8, minWidth: 140,
      valueGetter: (v) => v ? new Date(v).toLocaleString() : "—" },
    { field: "ends_at", headerName: "Ends", flex: 0.8, minWidth: 140,
      valueGetter: (v) => v ? new Date(v).toLocaleString() : "—" },
    { field: "is_active", headerName: "Active", flex: 0.4, minWidth: 80,
      renderCell: (p) => <Chip size="small" label={p.value ? "Yes" : "No"} color={p.value ? "success" : "default"} /> },
    {
      field: "_actions", headerName: "", flex: 0.6, minWidth: 150, sortable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5}>
          <Button size="small" onClick={() => openEdit(p.row)}>Edit</Button>
          <Button size="small" color="warning" onClick={() => softDelete(p.row)}>Off</Button>
        </Stack>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader title="Coupons" subtitle="Single-use & limited promotional codes" icon={<LocalOfferIcon />} />
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
        <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={openCreate}>New coupon</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">{rows.length} coupon{rows.length !== 1 ? "s" : ""}</Typography>
      <DataTable rows={rows} columns={cols} loading={loading} getRowId={(r) => r.id} height={600} emptyText="No coupons" />

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? "Edit coupon" : "New coupon"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Code" value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required />
            <Stack direction="row" spacing={2}>
              <TextField select label="Kind" value={form.discount_kind}
                onChange={(e) => setForm({ ...form, discount_kind: e.target.value })} sx={{ flex: 1 }}>
                <MenuItem value="percent">% off</MenuItem>
                <MenuItem value="amount">LKR off</MenuItem>
              </TextField>
              <TextField label="Value" value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                sx={{ flex: 1 }} inputProps={{ inputMode: "decimal" }} />
            </Stack>
            <TextField label="Min bill amount" value={form.min_bill_amount}
              onChange={(e) => setForm({ ...form, min_bill_amount: e.target.value })}
              inputProps={{ inputMode: "decimal" }} />
            <Stack direction="row" spacing={2}>
              <TextField select label="One-time" value={form.one_time ? "1" : "0"}
                onChange={(e) => setForm({ ...form, one_time: e.target.value === "1" })} sx={{ flex: 1 }}>
                <MenuItem value="0">No</MenuItem>
                <MenuItem value="1">Yes</MenuItem>
              </TextField>
              <TextField type="number" label="Per-customer limit (0 = none)" value={form.per_customer_limit}
                onChange={(e) => setForm({ ...form, per_customer_limit: e.target.value })} sx={{ flex: 1 }} />
            </Stack>
            <TextField type="number" label="Max usage (0 = unlimited)" value={form.max_usage}
              onChange={(e) => setForm({ ...form, max_usage: e.target.value })} />
            <Stack direction="row" spacing={2}>
              <TextField type="datetime-local" label="Starts" InputLabelProps={{ shrink: true }} value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })} sx={{ flex: 1 }} />
              <TextField type="datetime-local" label="Ends" InputLabelProps={{ shrink: true }} value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })} sx={{ flex: 1 }} />
            </Stack>
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
            disabled={!form.code || !form.value}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
