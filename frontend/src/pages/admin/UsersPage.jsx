import { useState, useEffect } from "react";
import {
  Stack, TextField, MenuItem, Switch, FormControlLabel, Button,
  IconButton, Tooltip, Chip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PeopleAltIcon from "@mui/icons-material/PeopleAlt";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, FormDialog, ConfirmDialog, StatusChip } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { getUsers, createUser, updateUser, deleteUser } from "../../api/users";
import { getOutlets } from "../../api/outlets";

const ROLES = [
  { value: "store_user", label: "Store User" },
  { value: "staff", label: "Staff" },
  { value: "manager", label: "Store Manager" },
  { value: "admin", label: "Admin" },
];

const EMPTY = { username: "", password: "", role: "store_user", outlet: "", is_active: true };

function errMsg(err, fallback) {
  const data = err.response?.data;
  if (!data) return fallback;
  const first = Object.values(data)[0];
  return Array.isArray(first) ? first[0] : fallback;
}

export default function UsersPage() {
  const notify = useNotify();
  const [users, setUsers] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getUsers(), getOutlets()])
      .then(([u, o]) => { setUsers(u.data); setOutlets(o.data); })
      .catch(() => notify.error("Failed to load data."))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  async function handleSubmit() {
    setSaving(true);
    try {
      const payload = { ...editing, outlet: editing.outlet || null };
      if (editing.id) {
        if (!payload.password) delete payload.password;
        const { data } = await updateUser(editing.id, payload);
        setUsers((p) => p.map((u) => (u.id === data.id ? data : u)));
        notify.success("User updated.");
      } else {
        const { data } = await createUser(payload);
        setUsers((p) => [...p, data].sort((a, b) => a.username.localeCompare(b.username)));
        notify.success(`User "${data.username}" created.`);
      }
      setEditing(null);
    } catch (err) { notify.error(errMsg(err, "Save failed.")); }
    finally { setSaving(false); }
  }

  async function handleToggleActive(user) {
    try {
      const { data } = await updateUser(user.id, { is_active: !user.is_active });
      setUsers((p) => p.map((u) => (u.id === user.id ? data : u)));
    } catch { notify.error("Failed to update status."); }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await deleteUser(deleting.id);
      setUsers((p) => p.filter((u) => u.id !== deleting.id));
      notify.success("User deleted.");
      setDeleting(null);
    } catch (err) { notify.error(err.response?.data?.detail || "Delete failed."); }
    finally { setSaving(false); }
  }

  const columns = [
    { field: "username", headerName: "Username", flex: 1, minWidth: 160 },
    {
      field: "role", headerName: "Role", flex: 0.8, minWidth: 140,
      renderCell: (p) => <StatusChip status={p.value} />,
    },
    { field: "outlet_name", headerName: "Outlet", flex: 1, minWidth: 140, valueGetter: (v) => v || "—" },
    {
      field: "is_active", headerName: "Status", flex: 0.6, minWidth: 110,
      renderCell: (p) => (
        <Chip
          size="small"
          label={p.value ? "Active" : "Inactive"}
          color={p.value ? "success" : "default"}
          variant={p.value ? "filled" : "outlined"}
          onClick={() => handleToggleActive(p.row)}
          sx={{ cursor: "pointer" }}
        />
      ),
    },
    {
      field: "actions", headerName: "", width: 110, sortable: false, filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Edit"><IconButton size="small" onClick={() => setEditing({
            id: p.row.id, username: p.row.username, role: p.row.role,
            outlet: p.row.outlet_id || "", is_active: p.row.is_active, password: "",
          })}>
            <EditIcon fontSize="small" />
          </IconButton></Tooltip>
          <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleting(p.row)}>
            <DeleteIcon fontSize="small" />
          </IconButton></Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader
        title="Users"
        subtitle="Manage staff accounts, roles, and outlet assignments"
        icon={<PeopleAltIcon />}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ ...EMPTY })}>
            New User
          </Button>
        }
      />

      <DataTable rows={users} columns={columns} loading={loading} emptyText="No users yet" />

      <FormDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSubmit={handleSubmit}
        title={editing?.id ? "Edit User" : "New User"}
        loading={saving}
        disableSubmit={!editing?.username?.trim() || (!editing?.id && !editing?.password)}
      >
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Username" required autoFocus fullWidth
            value={editing?.username || ""}
            onChange={(e) => setEditing((f) => ({ ...f, username: e.target.value }))}
          />
          <TextField
            label={editing?.id ? "New password (optional)" : "Password"}
            type="password" fullWidth required={!editing?.id} inputProps={{ minLength: 6 }}
            value={editing?.password || ""}
            onChange={(e) => setEditing((f) => ({ ...f, password: e.target.value }))}
          />
          <TextField
            select label="Role" fullWidth
            value={editing?.role || "store_user"}
            onChange={(e) => setEditing((f) => ({ ...f, role: e.target.value }))}
          >
            {ROLES.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
          </TextField>
          <TextField
            select label="Outlet" fullWidth
            value={editing?.outlet || ""}
            onChange={(e) => setEditing((f) => ({ ...f, outlet: e.target.value }))}
          >
            <MenuItem value="">— No outlet —</MenuItem>
            {outlets.map((o) => <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>)}
          </TextField>
          <FormControlLabel
            control={
              <Switch
                checked={Boolean(editing?.is_active)}
                onChange={(e) => setEditing((f) => ({ ...f, is_active: e.target.checked }))}
              />
            }
            label="Active"
          />
        </Stack>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        loading={saving}
        title="Delete user"
        message={deleting ? `Delete "${deleting.username}"? This cannot be undone.` : ""}
        confirmLabel="Delete"
      />
    </Layout>
  );
}
