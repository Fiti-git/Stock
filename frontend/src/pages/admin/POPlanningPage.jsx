import { useState, useCallback, useRef } from "react";
import {
  Stack, TextField, MenuItem, Button, Chip, Tooltip, Typography,
  Paper, Alert, Box, ToggleButtonGroup, ToggleButton, InputAdornment,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  TableSortLabel, CircularProgress,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import SearchIcon from "@mui/icons-material/Search";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { useOutlet } from "../../contexts/OutletContext";
import { getPOPlanning, downloadPOPlanningCsv } from "../../api/dashboard";
import { getOutlets } from "../../api/outlets";
import { useEffect } from "react";

const fmtQty = (v, decimals = 1) =>
  v == null ? "—" : Number(v).toLocaleString("en-LK", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
const fmtAmt = (v) =>
  v == null ? "—" : Number(v).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function DaysCoverChip({ val }) {
  if (val === null || val === undefined) return <Chip size="small" label="No stock" color="error" />;
  if (val === 0) return <Chip size="small" label="0 days" color="error" />;
  if (val < 7) return <Chip size="small" label={`${val}d`} color="error" variant="outlined" />;
  if (val < 14) return <Chip size="small" label={`${val}d`} color="warning" variant="outlined" />;
  return <Chip size="small" label={`${val}d`} color="success" variant="outlined" />;
}

const SORT_COLS = [
  { id: "item_code", label: "Item Code" },
  { id: "item_name", label: "Item Name" },
  { id: "category", label: "Category" },
  { id: "current_stock", label: "Stock", align: "right" },
  { id: "days_cover", label: "Days Cover", align: "center" },
  { id: "avg_daily_30", label: "Avg/Day 30d", align: "right" },
  { id: "avg_daily_90", label: "Avg/Day 90d", align: "right" },
  { id: "total_30d", label: "Sold 30d", align: "right" },
  { id: "suggested_qty", label: "Suggest Qty", align: "right" },
  { id: "cost_price", label: "Cost", align: "right" },
  { id: "est_cost", label: "Est. Cost", align: "right" },
];

export default function POPlanningPage() {
  const notify = useNotify();
  const { outletId: ctxOutletId } = useOutlet();

  const [outlets, setOutlets] = useState([]);
  const [selectedOutlet, setSelectedOutlet] = useState("");
  const [velocityDays, setVelocityDays] = useState(30);
  const [coverDays, setCoverDays] = useState(14);
  const [stockFilter, setStockFilter] = useState("below_reorder");
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("days_cover");
  const [order, setOrder] = useState("asc");

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [overrides, setOverrides] = useState({});

  // load outlets
  useEffect(() => {
    getOutlets().then(({ data }) => {
      const list = Array.isArray(data) ? data : data.outlets || [];
      setOutlets(list);
      if (!selectedOutlet) {
        const first = ctxOutletId ? list.find((o) => o.id === ctxOutletId) : list[0];
        if (first) setSelectedOutlet(String(first.id));
      }
    }).catch(() => {});
  }, []); // eslint-disable-line

  const load = useCallback(async (outletOverride) => {
    const oid = outletOverride || selectedOutlet;
    if (!oid) return;
    setLoading(true);
    try {
      const { data } = await getPOPlanning({
        outletId: oid,
        velocityDays,
        coverDays,
        filter: stockFilter,
        q: q.trim() || undefined,
        sortBy,
        order,
      });
      setRows(data.rows || []);
      setMeta(data);
      setOverrides({});
    } catch {
      notify.error("Failed to load PO planning data.");
    } finally {
      setLoading(false);
    }
  }, [selectedOutlet, velocityDays, coverDays, stockFilter, q, sortBy, order]); // eslint-disable-line

  // auto-load when outlet is set
  useEffect(() => {
    if (selectedOutlet) load();
  }, [selectedOutlet]); // eslint-disable-line

  function handleSort(col) {
    if (sortBy === col) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setOrder("asc");
    }
  }

  async function handleCsv() {
    if (!selectedOutlet) return;
    setCsvLoading(true);
    try {
      const { data } = await downloadPOPlanningCsv({
        outletId: selectedOutlet,
        velocityDays,
        coverDays,
        filter: stockFilter,
        q: q.trim() || undefined,
        sortBy,
        order,
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      const outletName = outlets.find((o) => String(o.id) === String(selectedOutlet))?.short_code || selectedOutlet;
      a.href = url;
      a.download = `po-plan-${outletName}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      notify.error("CSV download failed.");
    } finally {
      setCsvLoading(false);
    }
  }

  const effectiveRows = rows.map((r) => ({
    ...r,
    final_qty: overrides[r.item_code] ?? r.suggested_qty,
  }));

  const totalItems = effectiveRows.length;
  const totalEstCost = effectiveRows.reduce((s, r) => s + (r.final_qty * r.cost_price), 0);
  const totalSuggestedQty = effectiveRows.reduce((s, r) => s + r.final_qty, 0);
  const noSalesData = meta && !meta.has_sales_data;

  return (
    <Layout>
      <PageHeader
        title="PO Planning"
        subtitle="Velocity-based purchase order suggestions from real sales data"
        icon={<ShoppingCartIcon />}
        actions={
          <Button
            variant="outlined"
            startIcon={csvLoading ? <CircularProgress size={16} /> : <DownloadIcon />}
            onClick={handleCsv}
            disabled={csvLoading || rows.length === 0}
          >
            Export CSV
          </Button>
        }
      />

      {/* Controls */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-end" flexWrap="wrap">
          <TextField
            select label="Outlet" size="small" sx={{ minWidth: 220 }}
            value={selectedOutlet}
            onChange={(e) => setSelectedOutlet(e.target.value)}
          >
            {outlets.map((o) => (
              <MenuItem key={o.id} value={String(o.id)}>{o.outlet_name}</MenuItem>
            ))}
          </TextField>

          <TextField
            select label="Velocity period" size="small" sx={{ minWidth: 160 }}
            value={velocityDays}
            onChange={(e) => setVelocityDays(Number(e.target.value))}
            helperText="Sales window for avg daily"
          >
            <MenuItem value={30}>Last 30 days</MenuItem>
            <MenuItem value={90}>Last 90 days</MenuItem>
          </TextField>

          <TextField
            select label="Target cover" size="small" sx={{ minWidth: 160 }}
            value={coverDays}
            onChange={(e) => setCoverDays(Number(e.target.value))}
            helperText="Days of stock to aim for"
          >
            <MenuItem value={7}>7 days</MenuItem>
            <MenuItem value={14}>14 days</MenuItem>
            <MenuItem value={21}>21 days</MenuItem>
            <MenuItem value={30}>30 days</MenuItem>
            <MenuItem value={45}>45 days</MenuItem>
            <MenuItem value={60}>60 days</MenuItem>
          </TextField>

          <TextField
            select label="Show items" size="small" sx={{ minWidth: 180 }}
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
          >
            <MenuItem value="below_reorder">Below reorder level</MenuItem>
            <MenuItem value="out_of_stock">Out of stock only</MenuItem>
            <MenuItem value="all">All items</MenuItem>
          </TextField>

          <TextField
            size="small" placeholder="Search item…" sx={{ minWidth: 200 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />

          <Button variant="contained" onClick={() => load()} disabled={!selectedOutlet || loading}>
            {loading ? <CircularProgress size={18} /> : "Apply"}
          </Button>
        </Stack>
      </Paper>

      {/* No sales data warning */}
      {noSalesData && (
        <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
          No approved sales data found for this outlet. Suggested quantities are based on reorder level only — days cover and avg daily sales cannot be computed.
        </Alert>
      )}

      {/* Summary bar */}
      {meta && rows.length > 0 && (
        <Stack direction="row" spacing={3} sx={{ mb: 2 }} flexWrap="wrap">
          <Paper variant="outlined" sx={{ px: 2, py: 1, textAlign: "center" }}>
            <Typography variant="h6">{totalItems}</Typography>
            <Typography variant="caption" color="text.secondary">Items to order</Typography>
          </Paper>
          <Paper variant="outlined" sx={{ px: 2, py: 1, textAlign: "center" }}>
            <Typography variant="h6">{fmtQty(totalSuggestedQty, 0)}</Typography>
            <Typography variant="caption" color="text.secondary">Total units</Typography>
          </Paper>
          <Paper variant="outlined" sx={{ px: 2, py: 1, textAlign: "center" }}>
            <Typography variant="h6">LKR {fmtAmt(totalEstCost)}</Typography>
            <Typography variant="caption" color="text.secondary">Est. total cost</Typography>
          </Paper>
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary" alignSelf="center">
            Velocity: last {meta.velocity_days}d · Target: {meta.cover_days} days cover · As of {meta.as_of}
          </Typography>
        </Stack>
      )}

      {/* Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {SORT_COLS.map((col) => (
                <TableCell
                  key={col.id}
                  align={col.align || "left"}
                  sortDirection={sortBy === col.id ? order : false}
                >
                  <TableSortLabel
                    active={sortBy === col.id}
                    direction={sortBy === col.id ? order : "asc"}
                    onClick={() => handleSort(col.id)}
                  >
                    {col.label}
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell align="right">Your Qty</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={12} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={28} />
                </TableCell>
              </TableRow>
            )}
            {!loading && effectiveRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} align="center" sx={{ color: "text.secondary", py: 4 }}>
                  {selectedOutlet ? "No items match the current filter." : "Select an outlet to begin."}
                </TableCell>
              </TableRow>
            )}
            {effectiveRows.map((r) => {
              const isOutOfStock = r.current_stock <= 0;
              const isBelowReorder = r.current_stock <= r.reorder_level;
              return (
                <TableRow
                  key={r.item_code}
                  hover
                  sx={{
                    bgcolor: isOutOfStock
                      ? "error.50"
                      : isBelowReorder
                      ? "warning.50"
                      : undefined,
                  }}
                >
                  <TableCell sx={{ fontFamily: "monospace", fontSize: 12 }}>{r.item_code}</TableCell>
                  <TableCell sx={{ maxWidth: 260 }}>
                    <Typography variant="body2" noWrap title={r.item_name}>{r.item_name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">{r.category || "—"}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Stack alignItems="flex-end">
                      <Typography variant="body2" color={isOutOfStock ? "error" : undefined}>
                        {fmtQty(r.current_stock, 2)}
                      </Typography>
                      {r.snap_date && (
                        <Typography variant="caption" color="text.secondary">{r.snap_date}</Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="center">
                    <DaysCoverChip val={r.days_cover} />
                  </TableCell>
                  <TableCell align="right">
                    {r.has_sales_data ? fmtQty(r.avg_daily_30, 2) : <Typography variant="caption" color="text.secondary">—</Typography>}
                  </TableCell>
                  <TableCell align="right">
                    {r.has_sales_data ? fmtQty(r.avg_daily_90, 2) : <Typography variant="caption" color="text.secondary">—</Typography>}
                  </TableCell>
                  <TableCell align="right">
                    {r.has_sales_data ? fmtQty(r.total_30d, 0) : <Typography variant="caption" color="text.secondary">—</Typography>}
                  </TableCell>
                  <TableCell align="right">
                    <Chip
                      size="small"
                      label={fmtQty(r.suggested_qty, 0)}
                      color={r.suggested_qty > 0 ? "primary" : "default"}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">{fmtAmt(r.cost_price)}</TableCell>
                  <TableCell align="right">{fmtAmt(r.final_qty * r.cost_price)}</TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small"
                      type="number"
                      inputProps={{ min: 0, style: { width: 70, textAlign: "right" } }}
                      value={overrides[r.item_code] ?? r.suggested_qty}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value) || 0);
                        setOverrides((prev) => ({ ...prev, [r.item_code]: val }));
                      }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Layout>
  );
}
