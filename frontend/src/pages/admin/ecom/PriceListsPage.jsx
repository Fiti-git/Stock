import { useEffect, useState } from "react";
import {
  Stack, TextField, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Typography, Alert, Box, Switch, FormControlLabel, IconButton, Chip,
} from "@mui/material";
import PriceCheckIcon from "@mui/icons-material/PriceCheck";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import Layout from "../../../components/Layout";
import { PageHeader, DataTable } from "../../../components/ui";
import {
  listPriceLists, createPriceList, getPriceList, updatePriceList,
  deletePriceList, setPriceListItem, deletePriceListItem,
} from "../../../api/ecom";

function CreateDialog({ onClose, onCreated }) {
  const [form, setForm] = useState({ code: "", name: "", currency: "LKR", priority: 100, is_active: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await createPriceList(form);
      onCreated?.();
      onClose();
    } catch (e) {
      setError(e?.response?.data?.detail || "Create failed.");
    } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New Price List</DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2}>
          <TextField size="small" label="Code" required value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          <TextField size="small" label="Name" required value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <TextField size="small" label="Currency" value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
          <TextField size="small" label="Priority" type="number" value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            helperText="Lower = higher priority. Default 100." />
          <FormControlLabel control={<Switch checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />}
            label="Active" />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button variant="contained" disabled={busy || !form.code || !form.name} onClick={submit}>Create</Button>
      </DialogActions>
    </Dialog>
  );
}

function PriceListDialog({ id, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newItem, setNewItem] = useState({ item_id: "", unit_price: "", compare_at_price: "" });

  const load = () => getPriceList(id).then(({ data }) => setData(data)).catch(() => setError("Could not load."));
  useEffect(load, [id]);

  const save = async (patch) => {
    setBusy(true); setError(null);
    try {
      await updatePriceList(id, patch);
      load();
      onChanged?.();
    } catch (e) { setError("Save failed."); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm("Delete this price list and all its items?")) return;
    setBusy(true); setError(null);
    try {
      await deletePriceList(id);
      onChanged?.();
      onClose();
    } catch (e) { setError("Delete failed."); } finally { setBusy(false); }
  };
  const addItem = async () => {
    if (!newItem.item_id || !newItem.unit_price) return;
    setBusy(true); setError(null);
    try {
      await setPriceListItem(id, newItem);
      setNewItem({ item_id: "", unit_price: "", compare_at_price: "" });
      load();
    } catch (e) { setError(e?.response?.data?.detail || "Add failed."); } finally { setBusy(false); }
  };
  const removeItem = async (itemId) => {
    setBusy(true); setError(null);
    try { await deletePriceListItem(id, itemId); load(); }
    catch (e) { setError("Delete failed."); }
    finally { setBusy(false); }
  };

  if (!data) return null;
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between" }}>
        <Box>
          <Typography variant="h4">{data.code}</Typography>
          <Typography variant="caption" color="text.secondary">{data.name}</Typography>
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField size="small" label="Name" value={data.name}
              onChange={(e) => setData((d) => ({ ...d, name: e.target.value }))}
              onBlur={() => save({ name: data.name })} />
            <TextField size="small" label="Currency" value={data.currency}
              onChange={(e) => setData((d) => ({ ...d, currency: e.target.value }))}
              onBlur={() => save({ currency: data.currency })} />
            <TextField size="small" label="Priority" type="number" value={data.priority}
              onChange={(e) => setData((d) => ({ ...d, priority: e.target.value }))}
              onBlur={() => save({ priority: data.priority })} />
            <FormControlLabel control={<Switch checked={data.is_active}
              onChange={(e) => save({ is_active: e.target.checked })} />}
              label="Active" />
          </Stack>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Items ({data.items?.length || 0})</Typography>
            <DataTable
              rows={(data.items || []).map((r) => ({ id: r.id, ...r }))}
              columns={[
                { field: "item__item_code", headerName: "Code", width: 110 },
                { field: "item__item_name", headerName: "Item", flex: 1.6, minWidth: 200 },
                { field: "unit_price", headerName: "Unit", type: "number", width: 110 },
                { field: "compare_at_price", headerName: "Was", type: "number", width: 110 },
                {
                  field: "is_active", headerName: "Active", width: 90,
                  renderCell: (p) => p.value
                    ? <Chip size="small" color="success" label="on" />
                    : <Chip size="small" color="default" label="off" />,
                },
                {
                  field: "_remove", headerName: " ", width: 70, sortable: false,
                  renderCell: (p) => (
                    <IconButton size="small" onClick={() => removeItem(p.row.item_id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  ),
                },
              ]}
              toolbar={false} height={300} initialPageSize={10}
            />
          </Box>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <TextField size="small" label="Item ID" value={newItem.item_id}
              onChange={(e) => setNewItem((n) => ({ ...n, item_id: e.target.value }))}
              sx={{ width: 110 }} />
            <TextField size="small" label="Unit price" value={newItem.unit_price}
              onChange={(e) => setNewItem((n) => ({ ...n, unit_price: e.target.value }))}
              sx={{ width: 130 }} />
            <TextField size="small" label="Compare at (was)" value={newItem.compare_at_price}
              onChange={(e) => setNewItem((n) => ({ ...n, compare_at_price: e.target.value }))}
              sx={{ width: 160 }} />
            <Button size="small" variant="contained" startIcon={<AddIcon />}
              disabled={busy || !newItem.item_id || !newItem.unit_price} onClick={addItem}>
              Add / Update
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button color="error" onClick={remove} disabled={busy}>Delete list</Button>
        <Button onClick={onClose} color="inherit">Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function PriceListsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);

  const refresh = () => {
    setLoading(true); setError(null);
    listPriceLists()
      .then(({ data }) => setRows(data.map((r) => ({ id: r.id, ...r }))))
      .catch(() => setError("Could not load."))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, []);

  return (
    <Layout>
      <PageHeader
        title="Price Lists"
        subtitle="Define ecom prices independently from POS selling_price. Lower priority wins."
        icon={<PriceCheckIcon />}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)}>
            New Price List
          </Button>
        }
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <DataTable
        rows={rows} loading={loading} toolbar height={600} initialPageSize={25}
        columns={[
          { field: "code", headerName: "Code", width: 140 },
          { field: "name", headerName: "Name", flex: 1, minWidth: 200 },
          { field: "currency", headerName: "Currency", width: 100 },
          { field: "priority", headerName: "Priority", type: "number", width: 100 },
          { field: "item_count", headerName: "Items", type: "number", width: 90 },
          {
            field: "is_active", headerName: "Active", width: 100,
            renderCell: (p) => p.value
              ? <Chip size="small" color="success" label="on" />
              : <Chip size="small" color="default" label="off" />,
          },
          {
            field: "_open", headerName: " ", width: 110, sortable: false,
            renderCell: (p) => (
              <Button size="small" onClick={() => setOpenId(p.row.id)}>Manage</Button>
            ),
          },
        ]}
      />
      {creating && <CreateDialog onClose={() => setCreating(false)} onCreated={refresh} />}
      {openId && <PriceListDialog id={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </Layout>
  );
}
