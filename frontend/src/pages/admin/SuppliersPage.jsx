import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Stack, TextField, Switch, FormControlLabel, Button, IconButton, Tooltip, Chip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, FormDialog, ConfirmDialog } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import {
  getSuppliers, createSupplier, updateSupplier, deleteSupplier,
} from "../../api/suppliers";

const EMPTY = {
  code: "",
  name: "",
  contact_phone: "",
  contact_email: "",
  address: "",
  tax_reg_no: "",
  payment_terms: "",
  notes: "",
  is_active: true,
};

function errMsg(err, fallback) {
  const data = err.response?.data;
  if (!data) return fallback;
  const first = Object.values(data)[0];
  return typeof first === "string" ? first : fallback;
}

export default function SuppliersPage() {
  const navigate = useNavigate();
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
      const { data } = await getSuppliers({
        q: q.trim() || undefined,
        page: paginationModel.page + 1,
        pageSize: paginationModel.pageSize,
      });
      setRows(data.suppliers || []);
      setRowCount(data.count ?? 0);
    } catch {
      notify.error("Failed to load suppliers.");
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
      const payload = { ...editing };
      if (editing.id) {
        delete payload.code; // code isn't editable after creation
        delete payload.id;
        const { data } = await updateSupplier(editing.id, payload);
        setRows((p) => p.map((s) => (s.id === data.id ? data : s)));
        notify.success("Supplier updated.");
      } else {
        const { data } = await createSupplier(payload);
        setRows((p) => [data, ...p]);
        setRowCount((c) => c + 1);
        notify.success(`Supplier "${data.code}" created.`);
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
      const { data } = await deleteSupplier(deleting.id);
      if (data.status === "deactivated") {
        notify.info(`Supplier "${deleting.code}" deactivated — historical GRN rows kept.`);
      } else {
        notify.success("Supplier deleted.");
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
    { field: "code", headerName: "Code", width: 140 },
    { field: "name", headerName: "Name", flex: 1, minWidth: 200 },
    { field: "contact_phone", headerName: "Phone", width: 140 },
    { field: "contact_email", headerName: "Email", width: 200 },
    { field: "payment_terms", headerName: "Terms", width: 130 },
    { field: "tax_reg_no", headerName: "Tax Reg", width: 140 },
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
      field: "actions", headerName: "", width: 145, sortable: false, filterable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.25}>
          <Tooltip title="View details">
            <IconButton size="small" onClick={() => navigate(`/admin/suppliers/${p.row.id}`)}>
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
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
        title="Suppliers"
        subtitle="Master data · names, contacts, tax IDs, payment terms"
        icon={<LocalShippingIcon />}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ ...EMPTY })}>
            New Supplier
          </Button>
        }
      />

      <TextField
        size="small"
        placeholder="Search code or name…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        sx={{ mb: 2, width: 320 }}
      />

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        emptyText="No suppliers yet"
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
        title={editing?.id ? `Edit ${editing.code}` : "New Supplier"}
        loading={saving}
        disableSubmit={!editing?.id && !editing?.code?.trim()}
      >
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Code" required autoFocus fullWidth
            disabled={Boolean(editing?.id)}
            helperText={editing?.id ? "Code can't change — it links to GRN / RTS history." : "Short code used by the POS export (e.g. HINI0411)."}
            value={editing?.code || ""}
            onChange={(e) => setEditing((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
          />
          <TextField
            label="Name" fullWidth
            value={editing?.name || ""}
            onChange={(e) => setEditing((f) => ({ ...f, name: e.target.value }))}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Phone" fullWidth
              value={editing?.contact_phone || ""}
              onChange={(e) => setEditing((f) => ({ ...f, contact_phone: e.target.value }))}
            />
            <TextField
              label="Email" fullWidth
              value={editing?.contact_email || ""}
              onChange={(e) => setEditing((f) => ({ ...f, contact_email: e.target.value }))}
            />
          </Stack>
          <TextField
            label="Address" fullWidth multiline rows={2}
            value={editing?.address || ""}
            onChange={(e) => setEditing((f) => ({ ...f, address: e.target.value }))}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Tax Reg No" fullWidth
              value={editing?.tax_reg_no || ""}
              onChange={(e) => setEditing((f) => ({ ...f, tax_reg_no: e.target.value }))}
            />
            <TextField
              label="Payment Terms" fullWidth
              placeholder="e.g. Net 30"
              value={editing?.payment_terms || ""}
              onChange={(e) => setEditing((f) => ({ ...f, payment_terms: e.target.value }))}
            />
          </Stack>
          <TextField
            label="Notes" fullWidth multiline rows={2}
            value={editing?.notes || ""}
            onChange={(e) => setEditing((f) => ({ ...f, notes: e.target.value }))}
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
        title="Delete supplier"
        message={
          deleting
            ? `Delete "${deleting.code} ${deleting.name || ""}"? If any GRN or RTS history exists, the supplier will be deactivated instead to preserve historical links.`
            : ""
        }
        confirmLabel="Delete"
      />
    </Layout>
  );
}
