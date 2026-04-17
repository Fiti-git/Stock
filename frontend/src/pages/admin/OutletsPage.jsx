import { useState, useEffect } from "react";
import {
  Box, Button, Stack, TextField, IconButton, Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import StorefrontIcon from "@mui/icons-material/Storefront";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, FormDialog, ConfirmDialog } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { getOutlets, createOutlet, updateOutlet, deleteOutlet } from "../../api/outlets";

const EMPTY = { outlet_name: "", short_code: "", location_code: "" };

export default function OutletsPage() {
  const notify = useNotify();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | { id?, ...form }
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getOutlets()
      .then((r) => setRows(r.data))
      .catch(() => notify.error("Failed to load outlets."))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  async function handleSubmit() {
    if (!editing?.outlet_name?.trim()) return;
    setSaving(true);
    try {
      if (editing.id) {
        const { data } = await updateOutlet(editing.id, editing);
        setRows((p) => p.map((o) => (o.id === data.id ? data : o)));
        notify.success("Outlet updated.");
      } else {
        const { data } = await createOutlet(editing);
        setRows((p) => [...p, data]);
        notify.success("Outlet created.");
      }
      setEditing(null);
    } catch (err) {
      notify.error(err.response?.data?.outlet_name?.[0] || "Save failed.");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await deleteOutlet(deleting.id);
      setRows((p) => p.filter((o) => o.id !== deleting.id));
      notify.success("Outlet deleted.");
      setDeleting(null);
    } catch {
      notify.error("Delete failed. The outlet may have associated data.");
    } finally { setSaving(false); }
  }

  const columns = [
    { field: "outlet_name", headerName: "Outlet Name", flex: 1.4, minWidth: 200 },
    { field: "short_code", headerName: "Short Code", flex: 0.7, minWidth: 120, valueGetter: (v) => v || "—" },
    { field: "location_code", headerName: "Location Code", flex: 0.8, minWidth: 140, valueGetter: (v) => v || "—" },
    {
      field: "actions", headerName: "", width: 110, sortable: false, filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Edit"><IconButton size="small" onClick={() => setEditing({ id: p.row.id, outlet_name: p.row.outlet_name, short_code: p.row.short_code || "", location_code: p.row.location_code || "" })}>
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
        title="Outlets"
        subtitle="Manage store locations across the network"
        icon={<StorefrontIcon />}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ ...EMPTY })}>
            New Outlet
          </Button>
        }
      />

      <DataTable rows={rows} columns={columns} loading={loading} emptyText="No outlets yet" />

      <FormDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSubmit={handleSubmit}
        title={editing?.id ? "Edit Outlet" : "New Outlet"}
        loading={saving}
        disableSubmit={!editing?.outlet_name?.trim()}
      >
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Outlet Name" required autoFocus fullWidth
            value={editing?.outlet_name || ""}
            onChange={(e) => setEditing((f) => ({ ...f, outlet_name: e.target.value }))}
          />
          <TextField
            label="Short Code" fullWidth placeholder="e.g. GOH"
            value={editing?.short_code || ""}
            onChange={(e) => setEditing((f) => ({ ...f, short_code: e.target.value }))}
          />
          <TextField
            label="Location Code" fullWidth placeholder="e.g. 001"
            value={editing?.location_code || ""}
            onChange={(e) => setEditing((f) => ({ ...f, location_code: e.target.value }))}
          />
        </Stack>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        loading={saving}
        title="Delete outlet"
        message={deleting ? `Delete "${deleting.outlet_name}"? This cannot be undone.` : ""}
        confirmLabel="Delete"
      />
    </Layout>
  );
}
