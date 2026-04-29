import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, Chip, Typography, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControlLabel, Checkbox,
} from "@mui/material";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import {
  listTaxComponents, createTaxComponent, patchTaxComponent, deleteTaxComponent,
} from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

const emptyForm = () => ({
  code: "",
  name: "",
  rate_pct: "",
  inclusive: false,
  applies_to_categories: "",
  excluded_categories: "",
  priority: 100,
  starts_at: "",
  ends_at: "",
  is_active: true,
});

const csvToList = (s) => (s || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

export default function PosTaxComponentsPage() {
  const { notify } = useNotification();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listTaxComponents();
      setRows(r.data.results || r.data || []);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setEditOpen(true); };
  const openEdit = (c) => {
    setEditing(c);
    setForm({
      code: c.code || "",
      name: c.name || "",
      rate_pct: String(c.rate_pct ?? ""),
      inclusive: !!c.inclusive,
      applies_to_categories: (c.applies_to_categories || []).join(", "),
      excluded_categories: (c.excluded_categories || []).join(", "),
      priority: c.priority ?? 100,
      starts_at: c.starts_at || "",
      ends_at: c.ends_at || "",
      is_active: !!c.is_active,
    });
    setEditOpen(true);
  };

  const save = async () => {
    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      rate_pct: form.rate_pct,
      inclusive: !!form.inclusive,
      applies_to_categories: csvToList(form.applies_to_categories),
      excluded_categories: csvToList(form.excluded_categories),
      priority: Number(form.priority) || 100,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      is_active: !!form.is_active,
    };
    try {
      if (editing) await patchTaxComponent(editing.id, payload);
      else await createTaxComponent(payload);
      notify("Saved.", "success");
      setEditOpen(false);
      load();
    } catch (err) {
      notify(
        err?.response?.data?.detail ||
          JSON.stringify(err?.response?.data) ||
          "Failed.",
        "error",
      );
    }
  };

  const softDelete = async (c) => {
    if (!window.confirm(`Deactivate ${c.code}?`)) return;
    try {
      await patchTaxComponent(c.id, { is_active: false });
      load();
    } catch {
      try { await deleteTaxComponent(c.id); load(); } catch { notify("Failed.", "error"); }
    }
  };

  const cols = [
    { field: "code", headerName: "Code", flex: 0.6, minWidth: 90 },
    { field: "name", headerName: "Name", flex: 1, minWidth: 140 },
    {
      field: "rate_pct", headerName: "Rate %", flex: 0.5, minWidth: 80,
      valueGetter: (v) => Number(v || 0).toFixed(3),
    },
    {
      field: "inclusive", headerName: "Inclusive", flex: 0.5, minWidth: 90,
      renderCell: (p) => <Chip size="small" label={p.value ? "Yes" : "No"} color={p.value ? "info" : "default"} />,
    },
    {
      field: "applies_to_categories", headerName: "Applies", flex: 1, minWidth: 140,
      valueGetter: (v) => (Array.isArray(v) && v.length ? v.join(", ") : "(all)"),
    },
    {
      field: "excluded_categories", headerName: "Excluded", flex: 1, minWidth: 140,
      valueGetter: (v) => (Array.isArray(v) && v.length ? v.join(", ") : "—"),
    },
    { field: "priority", headerName: "Priority", flex: 0.4, minWidth: 80, type: "number" },
    {
      field: "is_active", headerName: "Active", flex: 0.4, minWidth: 80,
      renderCell: (p) => <Chip size="small" label={p.value ? "Yes" : "No"} color={p.value ? "success" : "default"} />,
    },
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
      <PageHeader
        title="Tax Components"
        subtitle="VAT, SVAT, SSCL, NBT — multi-component tax engine"
        icon={<ReceiptLongIcon />}
      />
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
        <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={openCreate}>New component</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {rows.length} component{rows.length !== 1 ? "s" : ""}
      </Typography>
      <DataTable
        rows={rows} columns={cols} loading={loading}
        getRowId={(r) => r.id} height={600}
        emptyText="No tax components — legacy single-rate path is active."
      />

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? "Edit tax component" : "New tax component"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={2}>
              <TextField label="Code" value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                required sx={{ flex: 1 }} />
              <TextField label="Name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required sx={{ flex: 2 }} />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField label="Rate %" value={form.rate_pct}
                onChange={(e) => setForm({ ...form, rate_pct: e.target.value })}
                inputProps={{ inputMode: "decimal" }} required sx={{ flex: 1 }} />
              <TextField type="number" label="Priority" value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })} sx={{ flex: 1 }} />
            </Stack>
            <FormControlLabel
              control={<Checkbox checked={!!form.inclusive}
                onChange={(e) => setForm({ ...form, inclusive: e.target.checked })} />}
              label="Inclusive (price already includes this tax)"
            />
            <TextField label="Applies to categories (comma-separated; empty = all)"
              value={form.applies_to_categories}
              onChange={(e) => setForm({ ...form, applies_to_categories: e.target.value })}
              helperText="e.g. FOOD, BEVERAGES" />
            <TextField label="Excluded categories (comma-separated)"
              value={form.excluded_categories}
              onChange={(e) => setForm({ ...form, excluded_categories: e.target.value })}
              helperText="e.g. BOOKS, MEDICINE" />
            <Stack direction="row" spacing={2}>
              <TextField type="date" label="Starts" InputLabelProps={{ shrink: true }}
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })} sx={{ flex: 1 }} />
              <TextField type="date" label="Ends" InputLabelProps={{ shrink: true }}
                value={form.ends_at}
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
            disabled={!form.code || !form.name || form.rate_pct === ""}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
