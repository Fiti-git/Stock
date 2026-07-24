import { useState, useEffect } from "react";
import {
  Stack, TextField, Switch, FormControlLabel, Button, IconButton, Tooltip, Chip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PlaceIcon from "@mui/icons-material/Place";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, FormDialog, ConfirmDialog } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import {
  getLocations, createLocation, updateLocation, deleteLocation,
} from "../../api/locations";

const EMPTY = { name: "", icon: "", sort_order: 0, is_active: true };

function errMsg(err, fallback) {
  const data = err.response?.data;
  if (!data) return fallback;
  const first = Object.values(data)[0];
  return typeof first === "string" ? first : fallback;
}

export default function LocationsPage() {
  const notify = useNotify();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await getLocations();
      setRows(Array.isArray(data) ? data : (data.results || []));
    } catch {
      notify.error("Failed to load locations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit() {
    setSaving(true);
    try {
      const isEdit = Boolean(editing.id);
      const payload = isEdit
        ? {
            icon: editing.icon || "",
            sort_order: Number(editing.sort_order) || 0,
            is_active: Boolean(editing.is_active),
          }
        : {
            name: editing.name.trim(),
            icon: editing.icon || "",
            sort_order: Number(editing.sort_order) || 0,
            is_active: Boolean(editing.is_active),
          };
      if (isEdit) {
        const { data } = await updateLocation(editing.id, payload);
        setRows((p) => p.map((r) => (r.id === data.id ? data : r)));
        notify.success("Location updated.");
      } else {
        const { data } = await createLocation(payload);
        setRows((p) => [...p, data].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
        notify.success(`Location "${data.name}" created.`);
      }
      setEditing(null);
    } catch (err) {
      notify.error(errMsg(err, "Save failed."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await deleteLocation(deleting.id);
      setRows((p) => p.filter((r) => r.id !== deleting.id));
      notify.success(`"${deleting.name}" deleted.`);
      setDeleting(null);
    } catch (err) {
      notify.error(err.response?.data?.detail || "Delete failed.");
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      field: "icon", headerName: "", width: 60, sortable: false, filterable: false,
      renderCell: (p) => <span style={{ fontSize: 22 }}>{p.value || "📍"}</span>,
    },
    { field: "name", headerName: "Name", flex: 1, minWidth: 200 },
    { field: "sort_order", headerName: "Sort", width: 90, type: "number" },
    {
      field: "is_active", headerName: "Status", width: 110,
      renderCell: (p) => (
        <Chip
          size="small"
          label={p.value ? "Active" : "Inactive"}
          color={p.value ? "success" : "default"}
          variant={p.value ? "filled" : "outlined"}
        />
      ),
    },
    {
      field: "actions", headerName: "", width: 110, sortable: false, filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.25}>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => setEditing({ ...EMPTY, ...p.row })}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" color="error" onClick={() => setDeleting(p.row)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  const isEdit = Boolean(editing?.id);

  return (
    <Layout>
      <PageHeader
        title="Locations"
        subtitle="Master data · physical places (rack, store room, etc.) shown as tiles in the mobile app when placing an item"
        icon={<PlaceIcon />}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ ...EMPTY })}>
            New Location
          </Button>
        }
      />

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        emptyText="No locations yet"
      />

      <FormDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSubmit={handleSubmit}
        title={isEdit ? `Edit "${editing.name}"` : "New Location"}
        loading={saving}
        disableSubmit={!editing?.name?.trim()}
      >
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Name" required autoFocus fullWidth
            disabled={isEdit}
            helperText={
              isEdit
                ? "Name can't be changed — delete and recreate if needed. (Prevents historical item locations from drifting.)"
                : "Shown on the mobile place-item tile. Must be unique."
            }
            value={editing?.name || ""}
            onChange={(e) => setEditing((f) => ({ ...f, name: e.target.value }))}
          />
          <TextField
            label="Icon (emoji)" fullWidth
            helperText="One emoji shown on the tile, e.g. 🗄️ 🏪 ↩️ 🖥️ 🏭 ⚠️ (optional)"
            value={editing?.icon || ""}
            onChange={(e) => setEditing((f) => ({ ...f, icon: e.target.value }))}
          />
          <TextField
            label="Sort order" type="number" fullWidth
            helperText="Lower numbers appear first (0 = default)."
            value={editing?.sort_order ?? 0}
            onChange={(e) => setEditing((f) => ({ ...f, sort_order: e.target.value }))}
          />
          <FormControlLabel
            control={
              <Switch
                checked={Boolean(editing?.is_active)}
                onChange={(e) => setEditing((f) => ({ ...f, is_active: e.target.checked }))}
              />
            }
            label="Active (shown in mobile app)"
          />
        </Stack>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        loading={saving}
        title="Delete location"
        message={
          deleting
            ? `Delete "${deleting.name}"? It will no longer appear as a tile in the mobile app. Items already tagged with this location keep their existing value.`
            : ""
        }
        confirmLabel="Delete"
      />
    </Layout>
  );
}
