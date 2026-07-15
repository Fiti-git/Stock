import { useEffect, useMemo, useState } from "react";
import {
  Stack, TextField, Typography, Paper, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, IconButton, Box, Alert,
} from "@mui/material";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import PlaceIcon from "@mui/icons-material/Place";
import CloseIcon from "@mui/icons-material/Close";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, EmptyState } from "../../components/ui";
import { useOutlet } from "../../contexts/OutletContext";
import { getStockVarianceReport } from "../../api/dashboard";

const fmtQty = (v) => v == null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const fmtMoney = (v) => v == null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isoToday = () => new Date().toISOString().slice(0, 10);

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

export default function StockVarianceReportPage() {
  const { outletId } = useOutlet();
  const [date, setDate] = useState(isoToday());
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [locRow, setLocRow] = useState(null);

  useEffect(() => {
    if (!outletId) { setRows([]); setTotals(null); return; }
    setLoading(true);
    setError(null);
    getStockVarianceReport({ outletId, date })
      .then(({ data }) => {
        setRows((data.results || []).map((r, i) => ({ id: `${r.item_id}-${i}`, ...r })));
        setTotals(data.totals || null);
      })
      .catch(() => { setError("Could not load report."); setRows([]); setTotals(null); })
      .finally(() => setLoading(false));
  }, [outletId, date]);

  const columns = useMemo(() => [
    { field: "item_code", headerName: "Code", width: 120 },
    { field: "item_name", headerName: "Item", flex: 1.6, minWidth: 220 },
    { field: "pos_qty", headerName: "POS Qty (Ending)", type: "number", width: 150, valueFormatter: fmtQty },
    { field: "counted_qty", headerName: "Counted Qty", type: "number", width: 130, valueFormatter: fmtQty },
    {
      field: "location_count", headerName: "Locations", width: 120, sortable: true,
      renderCell: (p) => p.row.location_count > 0 ? (
        <Button size="small" startIcon={<PlaceIcon fontSize="small" />} onClick={() => setLocRow(p.row)}>
          {p.row.location_count}
        </Button>
      ) : <Typography variant="body2" color="text.secondary">—</Typography>,
    },
    {
      field: "variance_qty", headerName: "Variance Qty", type: "number", width: 140,
      renderCell: (p) => {
        const v = p.value;
        if (v == null) return "—";
        const color = v === 0 ? "default" : v > 0 ? "success" : "error";
        return <Chip size="small" color={color} variant="outlined" label={fmtQty(v)} />;
      },
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
  ], []);

  return (
    <Layout>
      <PageHeader
        title="Stock Variance Report"
        subtitle="POS snapshot (ending balance) vs. manual count — qty and value variance"
        icon={<FactCheckIcon />}
        actions={
          <TextField
            size="small" type="date" label="Date"
            InputLabelProps={{ shrink: true }}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        }
      />

      {!outletId && (
        <Alert severity="info" sx={{ mb: 2 }}>Pick an outlet from the header switcher to view the report.</Alert>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {totals && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
            <Metric label="POS Qty" value={fmtQty(totals.pos_qty)} />
            <Metric label="Counted Qty" value={fmtQty(totals.counted_qty)} />
            <Metric
              label="Variance Qty"
              value={fmtQty(totals.variance_qty)}
              negative={totals.variance_qty < 0}
              positive={totals.variance_qty > 0}
            />
            <Metric
              label="Variance (Cost)"
              value={`LKR ${fmtMoney(totals.variance_cost_value)}`}
              negative={totals.variance_cost_value < 0}
              positive={totals.variance_cost_value > 0}
            />
            <Metric
              label="Variance (Sell)"
              value={`LKR ${fmtMoney(totals.variance_selling_value)}`}
              negative={totals.variance_selling_value < 0}
              positive={totals.variance_selling_value > 0}
            />
          </Stack>
        </Paper>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        emptyText={outletId ? "No items with snapshot or counts on this date" : "Select an outlet to begin"}
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
