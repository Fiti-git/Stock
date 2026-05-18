import { useEffect, useMemo, useState } from "react";
import {
  Stack, TextField, MenuItem, Typography, Paper, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, IconButton, Box, Alert,
} from "@mui/material";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import PlaceIcon from "@mui/icons-material/Place";
import CloseIcon from "@mui/icons-material/Close";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, EmptyState } from "../../components/ui";
import { getOutlets } from "../../api/outlets";
import { getCountCoverageReport } from "../../api/dashboard";
import { useAuth } from "../../contexts/AuthContext";

const fmtQty = (v) => v == null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const fmtMoney = (v) => v == null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleString();
};
const isoToday = () => new Date().toISOString().slice(0, 10);
const isoDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

function LocationsDialog({ row, onClose }) {
  const cols = [
    { field: "location_tag", headerName: "Location", flex: 1, minWidth: 160 },
    { field: "qty", headerName: "Qty", type: "number", flex: 0.5, minWidth: 100, valueFormatter: fmtQty },
  ];
  const rows = (row.locations || []).map((l, i) => ({ id: i, ...l }));
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Typography variant="h4">Locations ({rows.length})</Typography>
          <Typography variant="caption" color="text.secondary">{row.item_code} · {row.item_name}</Typography>
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {rows.length === 0 ? (
          <EmptyState title="No locations" description="No counts recorded for this item." />
        ) : (
          <DataTable rows={rows} columns={cols} toolbar={false} height={360} initialPageSize={25} />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function CountCoverageReportPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useState(isAdmin ? "" : (user?.outlet_id || ""));
  const [dateFrom, setDateFrom] = useState(isoDaysAgo(7));
  const [dateTo, setDateTo] = useState(isoToday());
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [locRow, setLocRow] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    getOutlets().then(({ data }) => setOutlets(Array.isArray(data) ? data : []));
  }, [isAdmin]);

  useEffect(() => {
    if (!outletId) { setRows([]); setTotals(null); return; }
    setLoading(true);
    setError(null);
    getCountCoverageReport({ outletId, dateFrom, dateTo })
      .then(({ data }) => {
        setRows((data.results || []).map((r, i) => ({ id: `${r.item_id}-${i}`, ...r })));
        setTotals(data.totals || null);
      })
      .catch(() => { setError("Could not load report."); setRows([]); setTotals(null); })
      .finally(() => setLoading(false));
  }, [outletId, dateFrom, dateTo]);

  const columns = useMemo(() => [
    { field: "item_code", headerName: "Code", width: 120 },
    { field: "item_name", headerName: "Item", flex: 1.6, minWidth: 220 },
    { field: "pos_qty", headerName: "POS Qty", type: "number", width: 120, valueFormatter: fmtQty },
    { field: "counted_qty", headerName: "Counted Qty", type: "number", width: 130, valueFormatter: fmtQty },
    {
      field: "variance_qty", headerName: "Variance Qty", type: "number", width: 140,
      renderCell: (p) => {
        const v = p.value;
        if (v == null) return "—";
        const color = v === 0 ? "default" : v > 0 ? "success" : "error";
        return <Chip size="small" color={color} variant="outlined" label={fmtQty(v)} />;
      },
    },
    {
      field: "location_count", headerName: "Locations", width: 120, sortable: true,
      renderCell: (p) => p.row.location_count > 0 ? (
        <Button size="small" startIcon={<PlaceIcon fontSize="small" />} onClick={() => setLocRow(p.row)}>
          {p.row.location_count}
        </Button>
      ) : <Typography variant="body2" color="text.secondary">—</Typography>,
    },
    { field: "cost_price", headerName: "Cost", type: "number", width: 100, valueFormatter: fmtMoney },
    { field: "selling_price", headerName: "Sell", type: "number", width: 100, valueFormatter: fmtMoney },
    {
      field: "variance_cost_value", headerName: "Variance (Cost)", type: "number", width: 150,
      valueFormatter: fmtMoney,
      cellClassName: (p) => p.value == null ? "" : p.value < 0 ? "var-neg" : p.value > 0 ? "var-pos" : "",
    },
    {
      field: "variance_selling_value", headerName: "Variance (Sell)", type: "number", width: 150,
      valueFormatter: fmtMoney,
      cellClassName: (p) => p.value == null ? "" : p.value < 0 ? "var-neg" : p.value > 0 ? "var-pos" : "",
    },
    { field: "snapshot_uploaded_at", headerName: "Snapshot Uploaded", width: 180, valueFormatter: (v) => fmtDateTime(v) },
    { field: "counted_at", headerName: "Counted At", width: 180, valueFormatter: (v) => fmtDateTime(v) },
  ], []);

  return (
    <Layout>
      <PageHeader
        title="Count Coverage Report"
        subtitle="Counted vs uncounted items by outlet & date range — variance against the POS snapshot in effect at count time"
        icon={<AssignmentTurnedInIcon />}
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <TextField
              size="small" type="date" label="From"
              InputLabelProps={{ shrink: true }}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <TextField
              size="small" type="date" label="To"
              InputLabelProps={{ shrink: true }}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
            {isAdmin ? (
              <TextField
                size="small" select label="Outlet" value={outletId}
                onChange={(e) => setOutletId(e.target.value)}
                sx={{ minWidth: 200 }}
              >
                <MenuItem value="">Select outlet…</MenuItem>
                {outlets.map((o) => (
                  <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>
                ))}
              </TextField>
            ) : (
              <Chip
                color="primary" variant="outlined"
                label={user?.outlet_name || "Your outlet"}
              />
            )}
          </Stack>
        }
      />

      {!outletId && isAdmin && (
        <Alert severity="info" sx={{ mb: 2 }}>Select an outlet to view the coverage report.</Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {totals && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
            <Metric label="Total items" value={totals.total_items.toLocaleString()} />
            <Metric label="Counted in range" value={totals.counted_items.toLocaleString()} positive={totals.counted_items > 0} />
            <Metric label="Uncounted" value={totals.uncounted_items.toLocaleString()} negative={totals.uncounted_items > 0} />
            <Metric label="Coverage" value={`${totals.coverage_pct.toFixed(2)}%`} />
          </Stack>
        </Paper>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        toolbar={true}
        emptyText={outletId ? "No items counted in this date range" : "Select an outlet to begin"}
        height={600}
        initialPageSize={50}
        pageSizeOptions={[25, 50, 100]}
        sx={{
          "& .var-neg": { color: "error.main", fontWeight: 600 },
          "& .var-pos": { color: "success.main", fontWeight: 600 },
        }}
      />

      {locRow && <LocationsDialog row={locRow} onClose={() => setLocRow(null)} />}
    </Layout>
  );
}

function Metric({ label, value, negative, positive }) {
  const color = negative ? "error.main" : positive ? "success.main" : "text.primary";
  return (
    <div>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="subtitle2" color={color}>{value}</Typography>
    </div>
  );
}
