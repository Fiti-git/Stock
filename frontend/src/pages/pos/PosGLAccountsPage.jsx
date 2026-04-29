import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, Chip, Typography, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControlLabel, Checkbox,
} from "@mui/material";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import EditIcon from "@mui/icons-material/Edit";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { listGLAccounts, createGLAccount, patchGLAccount } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

const PURPOSES = [
  "cash", "card", "bank", "ar_credit", "sales", "sales_return",
  "tax", "discount", "rounding", "tender_other", "gift_card_liability",
];

const emptyForm = () => ({
  code: "",
  name: "",
  purpose: "cash",
  is_active: true,
});

export default function PosGLAccountsPage() {
  const { notify } = useNotification();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listGLAccounts();
      setRows(r.data.results || r.data || []);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    } finally { setLoading(false); }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setEditOpen(true); };
  const openEdit = (acc) => {
    setEditing(acc);
    setForm({
      code: acc.code || "",
      name: acc.name || "",
      purpose: acc.purpose || "cash",
      is_active: !!acc.is_active,
    });
    setEditOpen(true);
  };

  const save = async () => {
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      purpose: form.purpose,
      is_active: !!form.is_active,
    };
    try {
      if (editing) await patchGLAccount(editing.id, payload);
      else await createGLAccount(payload);
      notify(editing ? "Account updated." : "Account created.", "success");
      setEditOpen(false);
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Save failed.", "error");
    }
  };

  const columns = [
    { field: "code", headerName: "Code", flex: 0.4, minWidth: 80 },
    { field: "name", headerName: "Name", flex: 1, minWidth: 160 },
    { field: "purpose", headerName: "Purpose", flex: 0.7, minWidth: 130,
      renderCell: (p) => <Chip size="small" label={p.value} /> },
    { field: "outlet", headerName: "Scope", flex: 0.5, minWidth: 100,
      valueGetter: (v) => v ? `Outlet ${v}` : "Chain-wide" },
    { field: "is_active", headerName: "Active", flex: 0.4, minWidth: 80,
      renderCell: (p) => <Chip size="small" label={p.value ? "Yes" : "No"} color={p.value ? "success" : "default"} /> },
    { field: "actions", headerName: "", flex: 0.4, minWidth: 90, sortable: false,
      renderCell: (p) => (
        <Button size="small" startIcon={<EditIcon />} onClick={() => openEdit(p.row)}>Edit</Button>
      ) },
  ];

  return (
    <Layout>
      <PageHeader title="GL Accounts" subtitle="Chart of accounts for GL export" icon={<AccountBalanceIcon />} />
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Add Account</Button>
        <Button startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">{rows.length} account{rows.length !== 1 ? "s" : ""}</Typography>
      <DataTable rows={rows} columns={columns} loading={loading} getRowId={(r) => r.id} height={600} emptyText="No accounts. Add one to enable GL export." />

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? "Edit Account" : "Add Account"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required fullWidth />
            <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required fullWidth />
            <TextField label="Purpose" select value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} fullWidth>
              {PURPOSES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
            </TextField>
            <FormControlLabel control={<Checkbox checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />} label="Active" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
