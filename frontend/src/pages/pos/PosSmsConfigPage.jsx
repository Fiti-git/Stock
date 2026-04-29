import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, Chip, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions,
  FormControlLabel, Checkbox,
} from "@mui/material";
import SmsIcon from "@mui/icons-material/Sms";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import {
  listSmsConfigs, createSmsConfig, patchSmsConfig, deleteSmsConfig,
} from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";
import { useAuth } from "../../contexts/AuthContext";

const PROVIDERS = [
  { value: "mock", label: "Mock (testing)" },
  { value: "dialog", label: "Dialog" },
  { value: "mobitel", label: "Mobitel" },
  { value: "hutch", label: "Hutch" },
  { value: "textit", label: "TextIt" },
];

const emptyForm = (outletId) => ({
  outlet: outletId || "",
  provider: "mock",
  sender_id: "",
  api_key: "",
  endpoint_url: "",
  is_active: true,
});

export default function PosSmsConfigPage() {
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
      const r = await listSmsConfigs();
      setRows(Array.isArray(r.data) ? r.data : (r.data.results || []));
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed to load SMS configs.", "error");
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
      sender_id: row.sender_id || "",
      api_key: "",
      endpoint_url: row.endpoint_url || "",
      is_active: !!row.is_active,
    });
    setEditOpen(true);
  };

  const submit = async () => {
    const payload = {
      outlet: form.outlet,
      provider: form.provider,
      sender_id: form.sender_id || "",
      endpoint_url: form.endpoint_url || "",
      is_active: form.is_active,
    };
    if (form.api_key) payload.api_key = form.api_key;
    try {
      if (editing) {
        await patchSmsConfig(editing.id, payload);
        notify("SMS config updated.", "success");
      } else {
        await createSmsConfig(payload);
        notify("SMS config created.", "success");
      }
      setEditOpen(false);
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Save failed.", "error");
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete ${row.provider} SMS config?`)) return;
    try {
      await deleteSmsConfig(row.id);
      notify("Deleted.", "info");
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    }
  };

  const columns = [
    { field: "provider", headerName: "Provider", width: 130 },
    { field: "sender_id", headerName: "Sender ID", width: 140 },
    { field: "endpoint_url", headerName: "Endpoint URL", flex: 1 },
    { field: "has_api_key", headerName: "API key set", width: 120,
      renderCell: (r) => <Chip size="small" color={r.row.has_api_key ? "success" : "default"}
        label={r.row.has_api_key ? "Yes" : "No"} /> },
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
      <PageHeader title="SMS Configuration" subtitle="Per-outlet SMS gateway for receipt notifications" icon={<SmsIcon />} />
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>New Config</Button>
        <Button startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </Stack>
      <DataTable rows={rows} columns={columns} loading={loading} getRowId={(r) => r.id} />

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? "Edit SMS Config" : "New SMS Config"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Provider" value={form.provider}
              disabled={!!editing}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}>
              {PROVIDERS.map((p) => (
                <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
              ))}
            </TextField>
            <TextField label="Sender ID" value={form.sender_id}
              onChange={(e) => setForm({ ...form, sender_id: e.target.value })} />
            <TextField label={editing ? "API Key (blank = keep existing)" : "API Key"}
              type="password" value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })} />
            <TextField label="Endpoint URL" value={form.endpoint_url}
              onChange={(e) => setForm({ ...form, endpoint_url: e.target.value })} />
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
