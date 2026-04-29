import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, Chip, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControlLabel, Checkbox,
} from "@mui/material";
import PercentIcon from "@mui/icons-material/Percent";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import {
  listCommissionRules, createCommissionRule, patchCommissionRule, deleteCommissionRule,
  listSalesReps,
} from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

const BASIS_OPTIONS = [
  { value: "line_total", label: "Line Total (%)" },
  { value: "line_profit", label: "Line Profit (%)" },
  { value: "line_qty", label: "Per Unit (LKR)" },
];

const emptyForm = () => ({
  rep: "",
  item_category: "",
  rate_pct: "",
  basis: "line_total",
  priority: 100,
  is_active: true,
  starts_at: "",
  ends_at: "",
});

export default function PosCommissionRulesPage() {
  const { notify } = useNotification();
  const [rows, setRows] = useState([]);
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, rr] = await Promise.all([listCommissionRules(), listSalesReps()]);
      setRows(r.data.results || []);
      setReps(rr.data.results || []);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setEditOpen(true);
  };
  const openEdit = (row) => {
    setEditing(row);
    setForm({
      rep: row.rep || "",
      item_category: row.item_category || "",
      rate_pct: row.rate_pct || "",
      basis: row.basis || "line_total",
      priority: row.priority ?? 100,
      is_active: !!row.is_active,
      starts_at: row.starts_at || "",
      ends_at: row.ends_at || "",
    });
    setEditOpen(true);
  };

  const submit = async () => {
    const payload = {
      rep: form.rep || null,
      item_category: form.item_category || "",
      rate_pct: form.rate_pct || "0",
      basis: form.basis,
      priority: Number(form.priority) || 100,
      is_active: form.is_active,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
    };
    try {
      if (editing) {
        await patchCommissionRule(editing.id, payload);
        notify("Rule updated.", "success");
      } else {
        await createCommissionRule(payload);
        notify("Rule created.", "success");
      }
      setEditOpen(false);
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Save failed.", "error");
    }
  };

  const remove = async (row) => {
    if (!window.confirm("Deactivate this rule?")) return;
    try {
      await deleteCommissionRule(row.id);
      notify("Deactivated.", "info");
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    }
  };

  const columns = [
    { field: "rep_username", headerName: "Rep", flex: 1,
      renderCell: (r) => r.row.rep_username || <em>(all)</em> },
    { field: "item_category", headerName: "Category", flex: 1,
      renderCell: (r) => r.row.item_category || <em>(all)</em> },
    { field: "basis", headerName: "Basis", width: 120 },
    { field: "rate_pct", headerName: "Rate", width: 100 },
    { field: "priority", headerName: "Pri", width: 80 },
    { field: "is_active", headerName: "Active", width: 90,
      renderCell: (r) => <Chip size="small" color={r.row.is_active ? "success" : "default"}
        label={r.row.is_active ? "Yes" : "No"} /> },
    { field: "actions", headerName: "Actions", width: 180, sortable: false,
      renderCell: (r) => (
        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={() => openEdit(r.row)}>Edit</Button>
          <Button size="small" color="error" onClick={() => remove(r.row)}>Delete</Button>
        </Stack>
      ) },
  ];

  return (
    <Layout>
      <PageHeader title="Commission Rules" subtitle="Per-rep, per-category commission rates" icon={<PercentIcon />} />
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>New Rule</Button>
        <Button startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </Stack>
      <DataTable rows={rows} columns={columns} loading={loading} getRowId={(r) => r.id} />

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? "Edit Rule" : "New Rule"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Rep (blank = all reps)" value={form.rep || ""}
              onChange={(e) => setForm({ ...form, rep: e.target.value })}>
              <MenuItem value=""><em>(all reps)</em></MenuItem>
              {reps.map((r) => (
                <MenuItem key={r.id} value={r.id}>{r.username}</MenuItem>
              ))}
            </TextField>
            <TextField label="Item Category (blank = all)" value={form.item_category}
              onChange={(e) => setForm({ ...form, item_category: e.target.value })} />
            <TextField select label="Basis" value={form.basis}
              onChange={(e) => setForm({ ...form, basis: e.target.value })}>
              {BASIS_OPTIONS.map((o) => (<MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>))}
            </TextField>
            <TextField label="Rate (% or LKR/unit)" value={form.rate_pct} type="number"
              onChange={(e) => setForm({ ...form, rate_pct: e.target.value })} />
            <TextField label="Priority (lower wins)" value={form.priority} type="number"
              onChange={(e) => setForm({ ...form, priority: e.target.value })} />
            <Stack direction="row" spacing={2}>
              <TextField label="Starts at" type="date" value={form.starts_at || ""}
                InputLabelProps={{ shrink: true }} fullWidth
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
              <TextField label="Ends at" type="date" value={form.ends_at || ""}
                InputLabelProps={{ shrink: true }} fullWidth
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
            </Stack>
            <FormControlLabel control={
              <Checkbox checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            } label="Active" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submit}>{editing ? "Save" : "Create"}</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
