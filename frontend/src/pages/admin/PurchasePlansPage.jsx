import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Stack, TextField, MenuItem, Button, Chip, IconButton, Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DeleteIcon from "@mui/icons-material/Delete";
import AssignmentIcon from "@mui/icons-material/Assignment";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, FormDialog, ConfirmDialog } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import {
  getPurchasePlans, createPurchasePlan, deletePurchasePlan,
} from "../../api/orgCatalog";
import { getSuppliers } from "../../api/suppliers";
import { getOutlets } from "../../api/outlets";
import { getCategoryOptions } from "../../api/categories";

const STATUS_COLORS = {
  draft: "default",
  approved: "success",
  sent: "info",
  received: "primary",
  cancelled: "error",
};

const EMPTY = {
  name: "",
  mode: "consolidated",
  supplier_id: "",
  category_id: "",
  outlet_ids: [],
  notes: "",
};

export default function PurchasePlansPage() {
  const notify = useNotify();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [categories, setCategories] = useState([]);

  async function load() {
    setLoading(true);
    try {
      const { data } = await getPurchasePlans();
      setRows(data.plans || []);
    } catch {
      notify.error("Failed to load purchase plans.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => {
    (async () => {
      try {
        const [sups, ols, cats] = await Promise.all([
          getSuppliers({ active: true, pageSize: 200 }),
          getOutlets(),
          getCategoryOptions(),
        ]);
        setSuppliers(sups.data.suppliers || []);
        setOutlets(Array.isArray(ols.data) ? ols.data : ols.data.outlets || []);
        setCategories(cats.data.categories || []);
      } catch { /* ignore */ }
    })();
  }, []);

  async function handleCreate() {
    setSaving(true);
    try {
      const payload = {
        ...creating,
        supplier_id: creating.supplier_id || null,
        category_id: creating.category_id || null,
        outlet_ids: creating.outlet_ids || [],
      };
      const { data } = await createPurchasePlan(payload);
      notify.success(`Plan "${data.name}" created with draft lines.`);
      setCreating(null);
      load();
      navigate(`/admin/purchase-plans/${data.id}`);
    } catch (err) {
      notify.error(err.response?.data?.detail || "Create failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await deletePurchasePlan(deleting.id);
      notify.success("Plan deleted.");
      setDeleting(null);
      load();
    } catch (err) {
      notify.error(err.response?.data?.detail || "Delete failed.");
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    { field: "id", headerName: "#", width: 70 },
    { field: "name", headerName: "Name", flex: 1, minWidth: 200 },
    { field: "mode", headerName: "Mode", width: 140 },
    {
      field: "status", headerName: "Status", width: 120,
      renderCell: (p) => (
        <Chip size="small" label={p.value} color={STATUS_COLORS[p.value] || "default"} />
      ),
    },
    { field: "supplier_code", headerName: "Supplier", width: 130 },
    { field: "line_count", headerName: "Lines", width: 80, type: "number" },
    { field: "created_by_name", headerName: "Created by", width: 140 },
    {
      field: "created_at", headerName: "Created", width: 160,
      renderCell: (p) => p.value ? new Date(p.value).toLocaleString() : "",
    },
    {
      field: "actions", headerName: "", width: 110, sortable: false, filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.25}>
          <Tooltip title="Open">
            <IconButton size="small" onClick={() => navigate(`/admin/purchase-plans/${p.row.id}`)}>
              <VisibilityIcon fontSize="small" />
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

  return (
    <Layout>
      <PageHeader
        title="Purchase Plans"
        subtitle="Generate POs from demand snapshots · consolidated per supplier or per-outlet"
        icon={<AssignmentIcon />}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating({ ...EMPTY })}>
            New Plan
          </Button>
        }
      />

      <DataTable rows={rows} columns={columns} loading={loading} emptyText="No plans yet" />

      <FormDialog
        open={Boolean(creating)}
        onClose={() => setCreating(null)}
        onSubmit={handleCreate}
        title="New Purchase Plan"
        loading={saving}
        disableSubmit={!creating?.name?.trim()}
      >
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Plan name" required autoFocus fullWidth
            helperText="Lines are generated automatically from the latest demand snapshot."
            value={creating?.name || ""}
            onChange={(e) => setCreating((f) => ({ ...f, name: e.target.value }))}
          />
          <TextField
            select label="Mode" fullWidth
            value={creating?.mode || "consolidated"}
            onChange={(e) => setCreating((f) => ({ ...f, mode: e.target.value }))}
          >
            <MenuItem value="consolidated">Consolidated per supplier</MenuItem>
            <MenuItem value="per_outlet">Per outlet</MenuItem>
          </TextField>
          <TextField
            select label="Supplier (optional)" fullWidth
            value={creating?.supplier_id || ""}
            onChange={(e) => setCreating((f) => ({ ...f, supplier_id: e.target.value }))}
            helperText="Filter demand to masters defaulting to this supplier."
          >
            <MenuItem value="">All suppliers</MenuItem>
            {suppliers.map((s) => (
              <MenuItem key={s.id} value={s.id}>{s.code} — {s.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            select label="Category (optional)" fullWidth
            value={creating?.category_id || ""}
            onChange={(e) => setCreating((f) => ({ ...f, category_id: e.target.value }))}
          >
            <MenuItem value="">All categories</MenuItem>
            {categories.map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            select fullWidth label="Outlets (optional)"
            SelectProps={{
              multiple: true,
              renderValue: (sel) =>
                sel.length === 0 ? "All outlets" :
                outlets.filter((o) => sel.includes(o.id)).map((o) => o.outlet_name).join(", "),
            }}
            value={creating?.outlet_ids || []}
            onChange={(e) => setCreating((f) => ({ ...f, outlet_ids: e.target.value }))}
          >
            {outlets.map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Notes" multiline rows={2} fullWidth
            value={creating?.notes || ""}
            onChange={(e) => setCreating((f) => ({ ...f, notes: e.target.value }))}
          />
        </Stack>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        loading={saving}
        title="Delete purchase plan"
        message={deleting ? `Delete "${deleting.name}" and all its lines?` : ""}
        confirmLabel="Delete"
      />
    </Layout>
  );
}
