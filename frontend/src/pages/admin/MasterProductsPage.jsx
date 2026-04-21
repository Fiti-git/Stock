import { useState, useEffect } from "react";
import {
  Stack, TextField, Switch, FormControlLabel, Button, IconButton, Tooltip, Chip,
  MenuItem,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, FormDialog, ConfirmDialog } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import {
  getMasterProducts, createMasterProduct, updateMasterProduct, deleteMasterProduct,
} from "../../api/orgCatalog";
import { getCategoryOptions } from "../../api/categories";
import { getSuppliers } from "../../api/suppliers";

const EMPTY = {
  master_code: "",
  name: "",
  brand: "",
  pack_size: "",
  unit: "EA",
  category_id: "",
  default_supplier_id: "",
  min_order_qty: 1,
  pack_multiple: 1,
  target_days_of_cover: 14,
  is_active: true,
};

const UNIT_OPTIONS = [
  { value: "EA", label: "Each" },
  { value: "KG", label: "Kilogram" },
  { value: "G", label: "Gram" },
  { value: "L", label: "Litre" },
  { value: "ML", label: "Millilitre" },
  { value: "PK", label: "Pack" },
];

function errMsg(err, fallback) {
  const data = err.response?.data;
  if (!data) return fallback;
  const first = Object.values(data)[0];
  return typeof first === "string" ? first : fallback;
}

export default function MasterProductsPage() {
  const notify = useNotify();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 50 });
  const [rowCount, setRowCount] = useState(0);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  async function load() {
    setLoading(true);
    try {
      const { data } = await getMasterProducts({
        q: q.trim() || undefined,
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
      });
      setRows(data.master_products || []);
      setRowCount(data.count ?? 0);
    } catch {
      notify.error("Failed to load master products.");
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

  useEffect(() => {
    (async () => {
      try {
        const [cats, sups] = await Promise.all([
          getCategoryOptions(),
          getSuppliers({ active: true, pageSize: 200 }),
        ]);
        setCategories(cats.data.categories || []);
        setSuppliers(sups.data.suppliers || []);
      } catch {
        // Dropdowns will just be empty; form still works via blank selection.
      }
    })();
  }, []);

  async function handleSubmit() {
    setSaving(true);
    try {
      const payload = {
        ...editing,
        category_id: editing.category_id || null,
        default_supplier_id: editing.default_supplier_id || null,
      };
      if (editing.id) {
        delete payload.master_code;
        delete payload.id;
        const { data } = await updateMasterProduct(editing.id, payload);
        setRows((p) => p.map((m) => (m.id === data.id ? data : m)));
        notify.success("Master product updated.");
      } else {
        const { data } = await createMasterProduct(payload);
        setRows((p) => [data, ...p]);
        setRowCount((c) => c + 1);
        notify.success(`Master "${data.master_code}" created.`);
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
      const { data } = await deleteMasterProduct(deleting.id);
      if (data.status === "deactivated") {
        notify.info(`Master "${deleting.master_code}" deactivated — linked items preserved.`);
      } else {
        notify.success("Master product deleted.");
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
    { field: "master_code", headerName: "Code", width: 140 },
    { field: "name", headerName: "Name", flex: 1, minWidth: 200 },
    { field: "brand", headerName: "Brand", width: 140 },
    { field: "pack_size", headerName: "Pack", width: 100 },
    { field: "unit", headerName: "Unit", width: 80 },
    { field: "category_name", headerName: "Category", width: 140 },
    { field: "default_supplier_code", headerName: "Supplier", width: 130 },
    { field: "target_days_of_cover", headerName: "Days Cover", width: 110, type: "number" },
    {
      field: "is_active", headerName: "Status", width: 100,
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
        title="Master Products"
        subtitle="Organization-level catalog · one master per physical product across outlets"
        icon={<Inventory2Icon />}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ ...EMPTY })}>
            New Master
          </Button>
        }
      />

      <TextField
        size="small"
        placeholder="Search code, name, brand…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        sx={{ mb: 2, width: 320 }}
      />

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        emptyText="No master products yet"
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
        title={editing?.id ? `Edit ${editing.master_code}` : "New Master Product"}
        loading={saving}
        disableSubmit={!editing?.id && (!editing?.master_code?.trim() || !editing?.name?.trim())}
      >
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Master Code" required autoFocus fullWidth
              disabled={Boolean(editing?.id)}
              helperText={editing?.id ? "Code can't change — used to link outlet items." : "Org-wide SKU (e.g. MP-SOAP-100)."}
              value={editing?.master_code || ""}
              onChange={(e) => setEditing((f) => ({ ...f, master_code: e.target.value.toUpperCase() }))}
            />
            <TextField
              label="Name" required fullWidth
              value={editing?.name || ""}
              onChange={(e) => setEditing((f) => ({ ...f, name: e.target.value }))}
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Brand" fullWidth
              value={editing?.brand || ""}
              onChange={(e) => setEditing((f) => ({ ...f, brand: e.target.value }))}
            />
            <TextField
              label="Pack Size" fullWidth
              placeholder="e.g. 100g, 12x500ml"
              value={editing?.pack_size || ""}
              onChange={(e) => setEditing((f) => ({ ...f, pack_size: e.target.value }))}
            />
            <TextField
              select label="Unit" fullWidth
              value={editing?.unit || "EA"}
              onChange={(e) => setEditing((f) => ({ ...f, unit: e.target.value }))}
            >
              {UNIT_OPTIONS.map((u) => (
                <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              select label="Category" fullWidth
              value={editing?.category_id || ""}
              onChange={(e) => setEditing((f) => ({ ...f, category_id: e.target.value }))}
            >
              <MenuItem value="">— None —</MenuItem>
              {categories.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              select label="Default Supplier" fullWidth
              value={editing?.default_supplier_id || ""}
              onChange={(e) => setEditing((f) => ({ ...f, default_supplier_id: e.target.value }))}
            >
              <MenuItem value="">— None —</MenuItem>
              {suppliers.map((s) => (
                <MenuItem key={s.id} value={s.id}>{s.code} — {s.name}</MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Min Order Qty" type="number" fullWidth
              inputProps={{ min: 1 }}
              value={editing?.min_order_qty ?? 1}
              onChange={(e) => setEditing((f) => ({ ...f, min_order_qty: Number(e.target.value) }))}
            />
            <TextField
              label="Pack Multiple" type="number" fullWidth
              inputProps={{ min: 1 }}
              helperText="Round suggested POs up to this multiple."
              value={editing?.pack_multiple ?? 1}
              onChange={(e) => setEditing((f) => ({ ...f, pack_multiple: Number(e.target.value) }))}
            />
            <TextField
              label="Target Days of Cover" type="number" fullWidth
              inputProps={{ min: 1 }}
              helperText="Used by the purchasing algorithm."
              value={editing?.target_days_of_cover ?? 14}
              onChange={(e) => setEditing((f) => ({ ...f, target_days_of_cover: Number(e.target.value) }))}
            />
          </Stack>
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
        title="Delete master product"
        message={
          deleting
            ? `Delete "${deleting.master_code} ${deleting.name || ""}"? If any outlet items are linked, the master will be deactivated instead so the links stay intact.`
            : ""
        }
        confirmLabel="Delete"
      />
    </Layout>
  );
}
