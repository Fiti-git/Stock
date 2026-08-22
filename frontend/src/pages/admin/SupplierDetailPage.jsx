import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box, Stack, Typography, Chip, Tabs, Tab, TextField, CircularProgress,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Paper,
  IconButton, Tooltip, Button, Switch, FormControlLabel,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditIcon from "@mui/icons-material/Edit";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import Layout from "../../components/Layout";
import { PageHeader, FormDialog } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { getSupplier, updateSupplier, getSupplierDetailScorecard } from "../../api/suppliers";

const fmtAmt = (v) => (v == null ? "—" : Number(v).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtQty = (v) => (v == null ? "—" : Number(v).toLocaleString("en-LK", { minimumFractionDigits: 0, maximumFractionDigits: 2 }));

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <Stack direction="row" spacing={1}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 130 }}>{label}</Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  );
}

function DriftChip({ pct }) {
  if (pct == null) return null;
  const up = pct > 0;
  const color = up ? "error" : "success";
  const Icon = up ? TrendingUpIcon : TrendingDownIcon;
  return (
    <Chip
      size="small"
      icon={<Icon fontSize="small" />}
      label={`${pct > 0 ? "+" : ""}${pct}%`}
      color={color}
      variant="outlined"
    />
  );
}

export default function SupplierDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();

  const [supplier, setSupplier] = useState(null);
  const [scorecard, setScorecard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);

  const today = new Date().toISOString().slice(0, 10);
  const ninetyAgo = new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(ninetyAgo);
  const [toDate, setToDate] = useState(today);

  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadSupplier = useCallback(async () => {
    try {
      const { data } = await getSupplier(id);
      setSupplier(data);
    } catch {
      notify.error("Failed to load supplier.");
    }
  }, [id]); // eslint-disable-line

  const loadScorecard = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getSupplierDetailScorecard(
        supplier?.code || id,
        { fromDate, toDate }
      );
      setScorecard(data);
    } catch {
      notify.error("Failed to load scorecard data.");
    } finally {
      setLoading(false);
    }
  }, [supplier?.code, id, fromDate, toDate]); // eslint-disable-line

  useEffect(() => { loadSupplier(); }, [loadSupplier]);
  useEffect(() => {
    if (supplier) loadScorecard();
  }, [supplier, loadScorecard]);

  async function handleSave() {
    setSaving(true);
    try {
      const payload = { ...editing };
      delete payload.id;
      delete payload.code;
      const { data } = await updateSupplier(id, payload);
      setSupplier(data);
      setEditing(null);
      notify.success("Supplier updated.");
    } catch (err) {
      notify.error(err.response?.data?.detail || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (!supplier && loading) {
    return (
      <Layout>
        <Box sx={{ display: "grid", placeItems: "center", minHeight: 300 }}>
          <CircularProgress size={28} />
        </Box>
      </Layout>
    );
  }

  const sup = supplier || {};

  return (
    <Layout>
      <PageHeader
        title={sup.code || "Supplier"}
        subtitle={sup.name || "No name set"}
        icon={<LocalShippingIcon />}
        actions={
          <Stack direction="row" spacing={1}>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/admin/suppliers")}>
              Back
            </Button>
            <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setEditing({ ...sup })}>
              Edit
            </Button>
          </Stack>
        }
      />

      {/* Supplier info card */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={3} flexWrap="wrap">
          <Stack spacing={0.75} flex={1}>
            <InfoRow label="Code" value={sup.code} />
            <InfoRow label="Name" value={sup.name || "—"} />
            <InfoRow label="Phone" value={sup.contact_phone} />
            <InfoRow label="Email" value={sup.contact_email} />
          </Stack>
          <Stack spacing={0.75} flex={1}>
            <InfoRow label="Address" value={sup.address} />
            <InfoRow label="Tax Reg No" value={sup.tax_reg_no} />
            <InfoRow label="Payment Terms" value={sup.payment_terms} />
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 130 }}>Status</Typography>
              <Chip
                size="small"
                label={sup.is_active ? "Active" : "Inactive"}
                color={sup.is_active ? "success" : "default"}
                variant={sup.is_active ? "filled" : "outlined"}
              />
            </Stack>
          </Stack>
          {sup.notes && (
            <Stack flex={2}>
              <Typography variant="body2" color="text.secondary">Notes</Typography>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{sup.notes}</Typography>
            </Stack>
          )}
        </Stack>
      </Paper>

      {/* Date range filter */}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <TextField
          label="From" type="date" size="small"
          value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
        />
        <TextField
          label="To" type="date" size="small"
          value={toDate} onChange={(e) => setToDate(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
        />
        <Button variant="outlined" size="small" onClick={loadScorecard} disabled={loading}>
          Apply
        </Button>
        {loading && <CircularProgress size={18} />}
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`GRN Deliveries (${scorecard?.deliveries?.length ?? "…"})`} />
        <Tab label={`Items Supplied (${scorecard?.top_items?.length ?? "…"})`} />
        <Tab label={`Cost Drift (${scorecard?.cost_drift?.length ?? "…"})`} />
      </Tabs>

      {/* Tab 0 — GRN Deliveries */}
      {tab === 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>DO No.</TableCell>
                <TableCell>Invoice</TableCell>
                <TableCell>Outlet</TableCell>
                <TableCell align="right">Lines</TableCell>
                <TableCell align="right">Value (LKR)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(scorecard?.deliveries || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ color: "text.secondary", py: 4 }}>
                    No deliveries in this period.
                  </TableCell>
                </TableRow>
              )}
              {(scorecard?.deliveries || []).map((d, i) => (
                <TableRow key={i} hover>
                  <TableCell>{d.txn_date}</TableCell>
                  <TableCell>{d.do_no}</TableCell>
                  <TableCell>{d.invoice_no || "—"}</TableCell>
                  <TableCell>{d.outlet_name}</TableCell>
                  <TableCell align="right">{d.lines}</TableCell>
                  <TableCell align="right">{fmtAmt(d.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Tab 1 — Items Supplied */}
      {tab === 1 && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item Code</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Qty Received</TableCell>
                <TableCell align="right">Deliveries</TableCell>
                <TableCell align="right">Value (LKR)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(scorecard?.top_items || []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ color: "text.secondary", py: 4 }}>
                    No items in this period.
                  </TableCell>
                </TableRow>
              )}
              {(scorecard?.top_items || []).map((item, i) => (
                <TableRow key={i} hover>
                  <TableCell sx={{ fontFamily: "monospace" }}>{item.item_code}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  <TableCell align="right">{fmtQty(item.qty)}</TableCell>
                  <TableCell align="right">{item.deliveries}</TableCell>
                  <TableCell align="right">{fmtAmt(item.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Tab 2 — Cost Drift */}
      {tab === 2 && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            First vs most recent cost price for each item in this period. Items with the biggest price changes are shown first.
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Item Code</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">First Cost</TableCell>
                  <TableCell>First Date</TableCell>
                  <TableCell align="right">Latest Cost</TableCell>
                  <TableCell>Latest Date</TableCell>
                  <TableCell align="center">Change</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(scorecard?.cost_drift || []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ color: "text.secondary", py: 4 }}>
                      No cost data in this period.
                    </TableCell>
                  </TableRow>
                )}
                {(scorecard?.cost_drift || []).map((r, i) => (
                  <TableRow key={i} hover>
                    <TableCell sx={{ fontFamily: "monospace" }}>{r.item_code}</TableCell>
                    <TableCell>{r.description}</TableCell>
                    <TableCell align="right">{fmtAmt(r.first_cost)}</TableCell>
                    <TableCell>{r.first_date}</TableCell>
                    <TableCell align="right">{fmtAmt(r.latest_cost)}</TableCell>
                    <TableCell>{r.latest_date}</TableCell>
                    <TableCell align="center">
                      <DriftChip pct={r.drift_pct} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Edit dialog */}
      <FormDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSubmit={handleSave}
        title={`Edit ${editing?.code || ""}`}
        loading={saving}
      >
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Code" disabled fullWidth value={editing?.code || ""}
            helperText="Code can't change — it links to GRN / RTS history." />
          <TextField label="Name" fullWidth value={editing?.name || ""}
            onChange={(e) => setEditing((f) => ({ ...f, name: e.target.value }))} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField label="Phone" fullWidth value={editing?.contact_phone || ""}
              onChange={(e) => setEditing((f) => ({ ...f, contact_phone: e.target.value }))} />
            <TextField label="Email" fullWidth value={editing?.contact_email || ""}
              onChange={(e) => setEditing((f) => ({ ...f, contact_email: e.target.value }))} />
          </Stack>
          <TextField label="Address" fullWidth multiline rows={2} value={editing?.address || ""}
            onChange={(e) => setEditing((f) => ({ ...f, address: e.target.value }))} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField label="Tax Reg No" fullWidth value={editing?.tax_reg_no || ""}
              onChange={(e) => setEditing((f) => ({ ...f, tax_reg_no: e.target.value }))} />
            <TextField label="Payment Terms" fullWidth placeholder="e.g. Net 30" value={editing?.payment_terms || ""}
              onChange={(e) => setEditing((f) => ({ ...f, payment_terms: e.target.value }))} />
          </Stack>
          <TextField label="Notes" fullWidth multiline rows={2} value={editing?.notes || ""}
            onChange={(e) => setEditing((f) => ({ ...f, notes: e.target.value }))} />
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
    </Layout>
  );
}
