import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, Chip, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControlLabel, Checkbox,
} from "@mui/material";
import PaymentIcon from "@mui/icons-material/Payment";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import {
  listPaymentGateways, createPaymentGateway, patchPaymentGateway, deletePaymentGateway,
} from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";
import { useAuth } from "../../contexts/AuthContext";

const PROVIDERS = [
  { value: "mock", label: "Mock (testing)" },
  { value: "sampath", label: "Sampath VishwaQR" },
  { value: "hnb", label: "HNB Solo" },
  { value: "frimi", label: "FriMi" },
  { value: "genie", label: "Genie" },
  { value: "helapay", label: "HelaPay" },
];

const emptyForm = (outletId) => ({
  outlet: outletId || "",
  provider: "mock",
  merchant_id: "",
  api_key: "",
  webhook_secret: "",
  callback_url: "",
  sandbox: true,
  is_active: true,
});

export default function PosPaymentGatewaysPage() {
  const { notify } = useNotification();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm(user?.outlet));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listPaymentGateways();
      setRows(Array.isArray(r.data) ? r.data : (r.data.results || []));
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed to load gateways.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(user?.outlet));
    setEditOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      outlet: row.outlet,
      provider: row.provider,
      merchant_id: row.merchant_id || "",
      api_key: "",   // never pre-fill — leaving blank means "keep existing"
      webhook_secret: row.webhook_secret || "",
      callback_url: row.callback_url || "",
      sandbox: !!row.sandbox,
      is_active: !!row.is_active,
    });
    setEditOpen(true);
  };

  const submit = async () => {
    const payload = {
      outlet: form.outlet,
      provider: form.provider,
      merchant_id: form.merchant_id || "",
      webhook_secret: form.webhook_secret || "",
      callback_url: form.callback_url || "",
      sandbox: form.sandbox,
      is_active: form.is_active,
    };
    if (form.api_key) payload.api_key = form.api_key;
    try {
      if (editing) {
        await patchPaymentGateway(editing.id, payload);
        notify("Gateway updated.", "success");
      } else {
        await createPaymentGateway(payload);
        notify("Gateway created.", "success");
      }
      setEditOpen(false);
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Save failed.", "error");
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete ${row.provider} gateway?`)) return;
    try {
      await deletePaymentGateway(row.id);
      notify("Deleted.", "info");
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    }
  };

  const columns = [
    { field: "provider", headerName: "Provider", width: 150 },
    { field: "merchant_id", headerName: "Merchant ID", flex: 1 },
    { field: "has_api_key", headerName: "API key set", width: 120,
      renderCell: (r) => <Chip size="small" color={r.row.has_api_key ? "success" : "default"}
        label={r.row.has_api_key ? "Yes" : "No"} /> },
    { field: "sandbox", headerName: "Sandbox", width: 100,
      renderCell: (r) => r.row.sandbox ? "Yes" : "No" },
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
      <PageHeader title="Payment Gateways" subtitle="Per-outlet QR / online payment provider credentials" icon={<PaymentIcon />} />
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>New Gateway</Button>
        <Button startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </Stack>
      <DataTable rows={rows} columns={columns} loading={loading} getRowId={(r) => r.id} />

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? "Edit Gateway" : "New Gateway"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Provider" value={form.provider}
              disabled={!!editing}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}>
              {PROVIDERS.map((p) => (
                <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
              ))}
            </TextField>
            <TextField label="Merchant ID" value={form.merchant_id}
              onChange={(e) => setForm({ ...form, merchant_id: e.target.value })} />
            <TextField label={editing ? "API Key (leave blank to keep existing)" : "API Key"}
              type="password" value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
            <TextField label="Webhook Secret" value={form.webhook_secret}
              onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })} />
            <TextField label="Callback URL" value={form.callback_url}
              onChange={(e) => setForm({ ...form, callback_url: e.target.value })} />
            <FormControlLabel control={
              <Checkbox checked={form.sandbox}
                onChange={(e) => setForm({ ...form, sandbox: e.target.checked })} />
            } label="Sandbox mode" />
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
