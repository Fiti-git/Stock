import { useEffect, useState } from "react";
import {
  Stack, TextField, Button, Typography, Paper, Box, IconButton, Alert,
  Divider, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem,
  Select, FormControl, InputLabel, Chip, LinearProgress, Table, TableHead,
  TableRow, TableCell, TableBody,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import AssignmentIcon from "@mui/icons-material/Assignment";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import {
  listPurchaseOrders, createPurchaseOrder, getPurchaseOrder,
  submitPurchaseOrder, cancelPurchaseOrder, closePurchaseOrder,
  searchProducts, searchSuppliers,
} from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

const STATUS_COLORS = {
  draft: "default", open: "info", partial: "warning",
  closed: "success", cancelled: "error",
};
const toN = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function PosPurchaseOrdersPage() {
  const { notify } = useNotification();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState({ status: "", supplier: "", date_from: "", date_to: "" });
  const [loading, setLoading] = useState(false);
  const [openNew, setOpenNew] = useState(false);
  const [detail, setDetail] = useState(null); // PO object

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.status) params.status = filter.status;
      if (filter.supplier) params.supplier = filter.supplier;
      if (filter.date_from) params.date_from = filter.date_from;
      if (filter.date_to) params.date_to = filter.date_to;
      const r = await listPurchaseOrders(params);
      setRows(r.data?.results || []);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed to load.", "error");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openDetail = async (id) => {
    try { const r = await getPurchaseOrder(id); setDetail(r.data); }
    catch (err) { notify(err?.response?.data?.detail || "Load failed.", "error"); }
  };

  const onAction = async (id, action, args) => {
    try {
      if (action === "submit") await submitPurchaseOrder(id);
      else if (action === "cancel") await cancelPurchaseOrder(id, args?.reason || "");
      else if (action === "close") await closePurchaseOrder(id);
      notify(`PO ${action}ed.`, "success");
      await load();
      if (detail) await openDetail(id);
    } catch (err) {
      notify(err?.response?.data?.detail || "Action failed.", "error");
    }
  };

  return (
    <Layout>
      <PageHeader title="Purchase Orders" subtitle="Send POs to suppliers and close them on receipt" icon={<AssignmentIcon />} />
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Status</InputLabel>
            <Select value={filter.status} label="Status" onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="open">Open</MenuItem>
              <MenuItem value="partial">Partial</MenuItem>
              <MenuItem value="closed">Closed</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
            </Select>
          </FormControl>
          <TextField size="small" label="Supplier ID" value={filter.supplier} onChange={(e) => setFilter({ ...filter, supplier: e.target.value })} />
          <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={filter.date_from} onChange={(e) => setFilter({ ...filter, date_from: e.target.value })} />
          <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={filter.date_to} onChange={(e) => setFilter({ ...filter, date_to: e.target.value })} />
          <Button onClick={load} startIcon={<RefreshIcon />} variant="outlined" size="small">Refresh</Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setOpenNew(true)} startIcon={<AddIcon />} variant="contained" size="small">New PO</Button>
        </Stack>
      </Paper>

      <Paper>
        {loading && <LinearProgress />}
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>PO No.</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Supplier</TableCell>
              <TableCell>Expected</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell>Created</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && !loading && (
              <TableRow><TableCell colSpan={7}><Alert severity="info">No purchase orders.</Alert></TableCell></TableRow>
            )}
            {rows.map((p) => (
              <TableRow key={p.id} hover sx={{ cursor: "pointer" }} onClick={() => openDetail(p.id)}>
                <TableCell><Typography variant="body2" fontWeight={600}>{p.po_no}</Typography></TableCell>
                <TableCell><Chip size="small" label={p.status} color={STATUS_COLORS[p.status] || "default"} /></TableCell>
                <TableCell>{p.supplier_name || `#${p.supplier_id}`}</TableCell>
                <TableCell>{p.expected_on || "—"}</TableCell>
                <TableCell align="right">{Number(p.grand_total).toFixed(2)}</TableCell>
                <TableCell>{p.created_at?.slice(0, 10)}</TableCell>
                <TableCell />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {openNew && <NewPoDialog onClose={() => setOpenNew(false)} onSaved={async () => { setOpenNew(false); await load(); }} />}
      {detail && <PoDetailDialog po={detail} onClose={() => setDetail(null)} onAction={onAction} />}
    </Layout>
  );
}

function NewPoDialog({ onClose, onSaved }) {
  const { notify } = useNotification();
  const [supplier, setSupplier] = useState("");
  const [supplierId, setSupplierId] = useState(null);
  const [supplierResults, setSupplierResults] = useState([]);
  const [expectedOn, setExpectedOn] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState([]);
  const [itemQ, setItemQ] = useState("");
  const [results, setResults] = useState([]);
  const [saving, setSaving] = useState(false);

  const onSupplierChange = async (val) => {
    setSupplier(val); setSupplierId(null);
    if (val.length < 2) { setSupplierResults([]); return; }
    try { const r = await searchSuppliers(val); setSupplierResults(r.data || []); } catch { /**/ }
  };

  const search = async (q) => {
    setItemQ(q);
    if (q.length < 2) { setResults([]); return; }
    try { const r = await searchProducts(q); setResults(r.data || []); } catch { /**/ }
  };
  const addLine = (it) => {
    setLines((p) => [...p, {
      key: Math.random().toString(36).slice(2),
      item_id: it.id, item_code: it.item_code, item_name: it.item_name,
      qty_ordered: 1, unit_cost: it.cost_price || "0", tax_rate_pct: 0,
    }]);
    setItemQ(""); setResults([]);
  };
  const upd = (k, patch) => setLines(lines.map((l) => l.key === k ? { ...l, ...patch } : l));
  const rem = (k) => setLines(lines.filter((l) => l.key !== k));
  const total = lines.reduce((s, l) => s + toN(l.qty_ordered) * toN(l.unit_cost), 0);

  const save = async () => {
    if (!supplierId) { notify("Pick a supplier.", "warning"); return; }
    if (!lines.length) { notify("Add at least one line.", "warning"); return; }
    setSaving(true);
    try {
      await createPurchaseOrder({
        supplier_id: supplierId,
        expected_on: expectedOn || undefined,
        note,
        lines: lines.map((l) => ({
          item_id: l.item_id,
          qty_ordered: String(l.qty_ordered),
          unit_cost: String(l.unit_cost),
          tax_rate_pct: String(l.tax_rate_pct || 0),
        })),
      });
      notify("PO created (draft). Submit to send.", "success");
      onSaved && onSaved();
    } catch (err) {
      notify(err?.response?.data?.detail || "Save failed.", "error");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>New Purchase Order</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box sx={{ position: "relative" }}>
            <TextField fullWidth label="Supplier" value={supplier} onChange={(e) => onSupplierChange(e.target.value)} />
            {supplierResults.length > 0 && (
              <Box sx={{ position: "absolute", zIndex: 20, left: 0, right: 0, bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: 1, maxHeight: 220, overflow: "auto", mt: 0.5 }}>
                {supplierResults.map((s) => (
                  <Box key={s.id} onClick={() => { setSupplier(s.name); setSupplierId(s.id); setSupplierResults([]); }}
                    sx={{ p: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}>
                    <Typography variant="body2" fontWeight={600}>{s.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{s.code}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField type="date" label="Expected on" InputLabelProps={{ shrink: true }} value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} />
            <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} sx={{ flex: 1 }} />
          </Stack>
          <Divider />
          <TextField size="small" placeholder="Search item code / name…" value={itemQ} onChange={(e) => search(e.target.value)} />
          {results.length > 0 && (
            <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, maxHeight: 200, overflow: "auto" }}>
              {results.map((r) => (
                <Box key={r.id} sx={{ p: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }} onClick={() => addLine(r)}>
                  <Typography variant="body2" fontWeight={600}>{r.item_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.item_code}</Typography>
                </Box>
              ))}
            </Box>
          )}
          {lines.length === 0 ? <Alert severity="info">No lines yet.</Alert> : (
            <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}>
              {lines.map((l) => (
                <Stack key={l.key} direction={{ xs: "column", md: "row" }} spacing={1} alignItems="center" sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <Typography variant="body2" fontWeight={600}>{l.item_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{l.item_code}</Typography>
                  </Box>
                  <TextField size="small" label="Qty" sx={{ width: 90 }} value={l.qty_ordered} onChange={(e) => upd(l.key, { qty_ordered: e.target.value })} />
                  <TextField size="small" label="Unit cost" sx={{ width: 110 }} value={l.unit_cost} onChange={(e) => upd(l.key, { unit_cost: e.target.value })} />
                  <TextField size="small" label="Tax %" sx={{ width: 80 }} value={l.tax_rate_pct} onChange={(e) => upd(l.key, { tax_rate_pct: e.target.value })} />
                  <Typography sx={{ width: 110, textAlign: "right" }} fontWeight={600}>
                    {(toN(l.qty_ordered) * toN(l.unit_cost)).toFixed(2)}
                  </Typography>
                  <IconButton size="small" color="error" onClick={() => rem(l.key)}><DeleteIcon fontSize="small" /></IconButton>
                </Stack>
              ))}
              <Stack direction="row" sx={{ p: 1, bgcolor: "action.hover" }}>
                <Typography sx={{ flex: 1 }} fontWeight={700}>Sub-total</Typography>
                <Typography fontWeight={700}>LKR {total.toFixed(2)}</Typography>
              </Stack>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving}>Create draft</Button>
      </DialogActions>
    </Dialog>
  );
}

function PoDetailDialog({ po, onClose, onAction }) {
  const [reason, setReason] = useState("");
  const editable = po.status === "draft";
  const submittable = po.status === "draft";
  const cancellable = ["draft", "open", "partial"].includes(po.status);
  const closable = ["open", "partial"].includes(po.status);

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="h6">{po.po_no}</Typography>
          <Chip size="small" label={po.status} color={STATUS_COLORS[po.status] || "default"} />
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction="row" spacing={4}>
            <Box><Typography variant="caption" color="text.secondary">Supplier</Typography>
              <Typography>{po.supplier_name || `#${po.supplier_id}`}</Typography></Box>
            <Box><Typography variant="caption" color="text.secondary">Expected</Typography>
              <Typography>{po.expected_on || "—"}</Typography></Box>
            <Box><Typography variant="caption" color="text.secondary">Grand total</Typography>
              <Typography>LKR {Number(po.grand_total).toFixed(2)}</Typography></Box>
          </Stack>
          {po.note && <Alert severity="info" variant="outlined">{po.note}</Alert>}
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell align="right">Ordered</TableCell>
                <TableCell align="right">Received</TableCell>
                <TableCell align="right">Unit cost</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell sx={{ width: 120 }}>Progress</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(po.lines || []).map((l) => {
                const ord = toN(l.qty_ordered), got = toN(l.qty_received);
                const pct = ord > 0 ? Math.min(100, (got / ord) * 100) : 0;
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{l.item_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{l.item_code}</Typography>
                    </TableCell>
                    <TableCell align="right">{l.qty_ordered}</TableCell>
                    <TableCell align="right">{l.qty_received}</TableCell>
                    <TableCell align="right">{Number(l.unit_cost).toFixed(2)}</TableCell>
                    <TableCell align="right">{Number(l.line_total).toFixed(2)}</TableCell>
                    <TableCell><LinearProgress variant="determinate" value={pct} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {cancellable && (
            <TextField size="small" label="Cancel reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {submittable && <Button variant="contained" onClick={() => onAction(po.id, "submit")}>Submit</Button>}
        {closable && <Button variant="outlined" color="success" onClick={() => onAction(po.id, "close")}>Close PO</Button>}
        {cancellable && <Button variant="outlined" color="error" onClick={() => onAction(po.id, "cancel", { reason })}>Cancel PO</Button>}
      </DialogActions>
    </Dialog>
  );
}
