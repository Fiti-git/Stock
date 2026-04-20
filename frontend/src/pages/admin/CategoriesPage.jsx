import { useState, useEffect } from "react";
import {
  Stack, TextField, Switch, FormControlLabel, Button, IconButton, Tooltip, Chip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CategoryIcon from "@mui/icons-material/Category";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, FormDialog, ConfirmDialog } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import {
  getCategories, createCategory, updateCategory, deleteCategory,
} from "../../api/categories";

const EMPTY = { name: "", description: "", sort_order: 0, is_active: true };

function errMsg(err, fallback) {
  const data = err.response?.data;
  if (!data) return fallback;
  const first = Object.values(data)[0];
  return typeof first === "string" ? first : fallback;
}

export default function CategoriesPage() {
  const notify = useNotify();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 50 });
  const [rowCount, setRowCount] = useState(0);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await getCategories({
        q: q.trim() || undefined,
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
      });
      setRows(data.categories || []);
      setRowCount(data.count ?? 0);
    } catch {
      notify.error("Failed to load categories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [paginationModel]); // eslint-disable-line

  useEffect(() => {
    const t = setTimeout(() => {
      setPaginationModel((m) => ({ ...m, page: 0 }));
      load();
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [q]);

  async function handleSubmit() {
    setSaving(true);
    try {
      const payload = {
        name: editing.name,
        description: editing.description,
        sort_order: Number(editing.sort_order) || 0,
        is_active: Boolean(editing.is_active),
      };
      if (editing.id) {
        const { data } = await updateCategory(editing.id, payload);
        setRows((p) => p.map((c) => (c.id === data.id ? data : c)));
        notify.success("Category updated.");
      } else {
        const { data } = await createCategory(payload);
        setRows((p) => [data, ...p]);
        setRowCount((c) => c + 1);
        notify.success(`Category "${data.name}" created.`);
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
      const { data } = await deleteCategory(deleting.id);
      if (data?.status === "deactivated") {
        notify.info(`"${deleting.name}" has items linked — deactivated instead.`);
      } else {
        notify.success("Category deleted.");
      }
      setDeleting(null);
      load();
    } catch (err) {
      notify.error(err.response?.data?.detail || "Delete failed.");
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    { field: "name", headerName: "Name", flex: 1, minWidth: 200 },
    { field: "description", headerName: "Description", flex: 1.4, minWidth: 220 },
    { field: "sort_order", headerName: "Sort", width: 80, type: "number" },
    { field: "item_count", headerName: "Items", width: 100, type: "number" },
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
          <Tooltip title="Delete / deactivate">
            <IconButton size="small" color="error" onClick={() => setDeleting(p.row)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader
        title="Categories"
        subtitle="Master data · group items into departments for reporting and drill-down"
        icon={<CategoryIcon />}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ ...EMPTY })}>
            New Category
          </Button>
        }
      />

      <TextField
        size="small"
        placeholder="Search name or description…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        sx={{ mb: 2, width: 320 }}
      />

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        emptyText="No categories yet"
        paginationMode="server"
        rowCount={rowCount}
        paginationModel={paginationModel}
        onPaginationModelChange={setPaginationModel}
        pageSizeOptions={[25, 50, 100]}
      />

      <FormDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSubmit={handleSubmit}
        title={editing?.id ? `Edit "${editing.name}"` : "New Category"}
        loading={saving}
        disableSubmit={!editing?.name?.trim()}
      >
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Name" required autoFocus fullWidth
            helperText="Shown in dropdowns and reports. Must be unique."
            value={editing?.name || ""}
            onChange={(e) => setEditing((f) => ({ ...f, name: e.target.value }))}
          />
          <TextField
            label="Description" fullWidth multiline rows={2}
            value={editing?.description || ""}
            onChange={(e) => setEditing((f) => ({ ...f, description: e.target.value }))}
          />
          <TextField
            label="Sort order" type="number" fullWidth
            helperText="Lower numbers appear first in dropdowns (0 = default)."
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
            label="Active"
          />
        </Stack>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        loading={saving}
        title="Delete category"
        message={
          deleting
            ? `Delete "${deleting.name}"? ${
                deleting.item_count > 0
                  ? `${deleting.item_count} item(s) are linked — the category will be deactivated instead to preserve history.`
                  : "No items are linked, so this will be permanently removed."
              }`
            : ""
        }
        confirmLabel="Delete"
      />
    </Layout>
  );
}
