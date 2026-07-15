import { useEffect, useMemo, useState } from "react";
import {
  Stack, TextField, Typography, Paper, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, IconButton, Box, CircularProgress,
  Alert, Chip,
} from "@mui/material";
import AssessmentIcon from "@mui/icons-material/Assessment";
import FiberNewIcon from "@mui/icons-material/FiberNew";
import CloseIcon from "@mui/icons-material/Close";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, EmptyState } from "../../components/ui";
import { useOutlet } from "../../contexts/OutletContext";
import { getDailyUploadReport, getDailyUploadNewItems } from "../../api/dashboard";

const fmtMoney = (v) => v == null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v) => v == null ? "—" : `${Number(v).toFixed(2)}%`;

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function eachDateISO(fromISO, toISO) {
  const out = [];
  const start = new Date(fromISO);
  const end = new Date(toISO);
  if (isNaN(start) || isNaN(end) || start > end) return out;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function NewItemsDialog({ outletId, outletName, date, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    getDailyUploadNewItems({ outletId, date })
      .then(({ data }) => setItems(data.results || []))
      .catch(() => setError("Could not load new items."))
      .finally(() => setLoading(false));
  }, [outletId, date]);

  const columns = [
    { field: "item_code", headerName: "Code", flex: 0.8, minWidth: 110 },
    { field: "item_name", headerName: "Name", flex: 1.8, minWidth: 200 },
    { field: "cost_price", headerName: "Cost", flex: 0.5, minWidth: 90, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { field: "selling_price", headerName: "Sell", flex: 0.5, minWidth: 90, valueGetter: (v) => v != null ? Number(v).toFixed(2) : "—" },
    { field: "pos_quantity", headerName: "Qty", flex: 0.5, minWidth: 80, valueGetter: (v) => v != null ? Number(v).toFixed(0) : "—" },
  ];

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Typography variant="h4">New Items ({items.length})</Typography>
          <Typography variant="caption" color="text.secondary">
            {outletName} · <b>{date}</b>
          </Typography>
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading && <Box sx={{ display: "grid", placeItems: "center", py: 6 }}><CircularProgress /></Box>}
        {error && <Alert severity="error">{error}</Alert>}
        {!loading && !error && (
          items.length === 0 ? (
            <EmptyState title="No new items" description="This upload introduced no new products." />
          ) : (
            <DataTable
              rows={items}
              columns={columns}
              getRowId={(r) => r.item_code}
              height={560}
              initialPageSize={25}
              pageSizeOptions={[25, 50, 100]}
            />
          )
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function DailyUploadReportPage() {
  const { outletId, selectedOutlet } = useOutlet();
  const [fromDate, setFromDate] = useState(isoDaysAgo(7));
  const [toDate, setToDate] = useState(isoToday());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newItemsCtx, setNewItemsCtx] = useState(null);

  const fetchReport = () => {
    setLoading(true);
    getDailyUploadReport({ fromDate, toDate, outletId: outletId || null })
      .then(({ data }) => {
        const withId = (data.results || []).map((r, i) => ({ id: `${r.outlet_id}-${r.upload_date}-${i}`, ...r }));
        setRows(withId);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchReport(); /* eslint-disable-next-line */ }, [fromDate, toDate, outletId]);

  const selectedOutletName = selectedOutlet?.name || "";

  const displayRows = useMemo(() => {
    if (!outletId) return rows;
    const have = new Set(rows.map((r) => r.upload_date));
    const dates = eachDateISO(fromDate, toDate);
    const missing = dates
      .filter((d) => !have.has(d))
      .map((d) => ({
        id: `missing-${outletId}-${d}`,
        outlet_id: Number(outletId),
        outlet_name: selectedOutletName,
        upload_date: d,
        is_missing: true,
        new_items_count: 0,
        total_items: 0,
        total_cost_value: null,
        total_selling_value: null,
        gross_profit_value: null,
        gross_profit_pct: null,
        negative_items_count: 0,
        negative_cost_value: null,
        negative_selling_value: null,
        negative_gross_profit_value: null,
        negative_gross_profit_pct: null,
      }));
    return [...rows, ...missing].sort((a, b) =>
      a.upload_date < b.upload_date ? 1 : -1
    );
  }, [rows, outletId, fromDate, toDate, selectedOutletName]);

  const missingCount = displayRows.filter((r) => r.is_missing).length;

  const columns = useMemo(() => [
    { field: "outlet_name", headerName: "Outlet", flex: 1, minWidth: 140 },
    {
      field: "upload_date", headerName: "Upload Date", width: 140,
      renderCell: (p) => p.row.is_missing ? (
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Typography variant="body2">{p.value}</Typography>
          <Chip size="small" color="error" variant="outlined" label="Missing" />
        </Stack>
      ) : p.value,
    },
    {
      field: "actions", headerName: "", width: 60, sortable: false, filterable: false,
      renderCell: (p) => {
        const hasNew = !p.row.is_missing && (p.row.new_items_count ?? 0) > 0;
        return (
          <IconButton
            size="small"
            color="warning"
            disabled={!hasNew}
            title={hasNew ? `View ${p.row.new_items_count} new items` : "No new items"}
            onClick={() => setNewItemsCtx({
              outletId: p.row.outlet_id,
              outletName: p.row.outlet_name,
              date: p.row.upload_date,
            })}
          >
            <FiberNewIcon fontSize="small" />
          </IconButton>
        );
      },
    },
    { field: "new_items_count", headerName: "New Items", type: "number", width: 100 },
    { field: "total_items", headerName: "Total Items", type: "number", width: 110 },
    { field: "total_cost_value", headerName: "Total Cost (LKR)", type: "number", width: 150,
      valueFormatter: (v) => fmtMoney(v) },
    { field: "total_selling_value", headerName: "Total Selling (LKR)", type: "number", width: 160,
      valueFormatter: (v) => fmtMoney(v) },
    { field: "gross_profit_value", headerName: "GP Value (LKR)", type: "number", width: 140,
      valueFormatter: (v) => fmtMoney(v) },
    { field: "gross_profit_pct", headerName: "GP %", type: "number", width: 100,
      valueFormatter: (v) => fmtPct(v) },
    { field: "negative_items_count", headerName: "Neg. Items", type: "number", width: 110 },
    { field: "negative_cost_value", headerName: "Neg. Cost (LKR)", type: "number", width: 150,
      valueFormatter: (v) => fmtMoney(v) },
    { field: "negative_selling_value", headerName: "Neg. Selling (LKR)", type: "number", width: 160,
      valueFormatter: (v) => fmtMoney(v) },
    { field: "negative_gross_profit_value", headerName: "Neg. GP Value (LKR)", type: "number", width: 170,
      valueFormatter: (v) => fmtMoney(v) },
    { field: "negative_gross_profit_pct", headerName: "Neg. GP %", type: "number", width: 110,
      valueFormatter: (v) => fmtPct(v) },
  ], []);

  const totals = useMemo(() => {
    const sum = (k) => rows.reduce((acc, r) => acc + (Number(r[k]) || 0), 0);
    const cost = sum("total_cost_value");
    const sell = sum("total_selling_value");
    const negSell = sum("negative_selling_value");
    const negCost = sum("negative_cost_value");
    return {
      total_cost: cost,
      total_selling: sell,
      gp_value: sell - cost,
      gp_pct: sell > 0 ? ((sell - cost) / sell) * 100 : null,
      neg_selling: negSell,
      neg_cost: negCost,
      neg_gp_value: negSell - negCost,
      neg_gp_pct: negSell !== 0 ? ((negSell - negCost) / negSell) * 100 : null,
    };
  }, [rows]);

  return (
    <Layout>
      <PageHeader
        title="Daily Upload Report"
        subtitle="Per-outlet, per-date aggregates from daily Excel uploads"
        icon={<AssessmentIcon />}
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <TextField
              size="small" type="date" label="From"
              InputLabelProps={{ shrink: true }}
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
            <TextField
              size="small" type="date" label="To"
              InputLabelProps={{ shrink: true }}
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </Stack>
        }
      />

      {rows.length > 0 && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
            <Metric label="Total Cost" value={`LKR ${fmtMoney(totals.total_cost)}`} />
            <Metric label="Total Selling" value={`LKR ${fmtMoney(totals.total_selling)}`} />
            <Metric label="Gross Profit" value={`LKR ${fmtMoney(totals.gp_value)} (${fmtPct(totals.gp_pct)})`} />
            <Metric label="Neg. Cost" value={`LKR ${fmtMoney(totals.neg_cost)}`} negative />
            <Metric label="Neg. Selling" value={`LKR ${fmtMoney(totals.neg_selling)}`} negative />
            <Metric label="Neg. GP" value={`LKR ${fmtMoney(totals.neg_gp_value)} (${fmtPct(totals.neg_gp_pct)})`} negative />
          </Stack>
        </Paper>
      )}

      {outletId && missingCount > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {missingCount} missing upload{missingCount === 1 ? "" : "s"} for {selectedOutletName} in this date range.
        </Alert>
      )}

      <DataTable
        rows={displayRows}
        columns={columns}
        loading={loading}
        emptyText="No uploads in this date range"
        height={600}
        initialPageSize={50}
        pageSizeOptions={[25, 50, 100]}
        getRowClassName={(p) => p.row.is_missing ? "row-missing" : ""}
        sx={{
          "& .row-missing": { bgcolor: "rgba(211, 47, 47, 0.08)" },
        }}
      />

      {newItemsCtx && (
        <NewItemsDialog
          outletId={newItemsCtx.outletId}
          outletName={newItemsCtx.outletName}
          date={newItemsCtx.date}
          onClose={() => setNewItemsCtx(null)}
        />
      )}
    </Layout>
  );
}

function Metric({ label, value, negative }) {
  return (
    <div>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="subtitle2" color={negative ? "error.main" : "text.primary"}>{value}</Typography>
    </div>
  );
}
