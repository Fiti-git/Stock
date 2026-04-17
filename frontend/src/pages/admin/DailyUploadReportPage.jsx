import { useEffect, useMemo, useState } from "react";
import {
  Stack, TextField, MenuItem, Typography, Paper,
} from "@mui/material";
import AssessmentIcon from "@mui/icons-material/Assessment";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { getOutlets } from "../../api/outlets";
import { getDailyUploadReport } from "../../api/dashboard";

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

export default function DailyUploadReportPage() {
  const [outlets, setOutlets] = useState([]);
  const [outletId, setOutletId] = useState("");
  const [fromDate, setFromDate] = useState(isoDaysAgo(7));
  const [toDate, setToDate] = useState(isoToday());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getOutlets().then(({ data }) => setOutlets(Array.isArray(data) ? data : []));
  }, []);

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

  const columns = useMemo(() => [
    { field: "outlet_name", headerName: "Outlet", flex: 1, minWidth: 140 },
    { field: "upload_date", headerName: "Upload Date", width: 120 },
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
            <TextField
              size="small" select label="Outlet" value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">All outlets</MenuItem>
              {outlets.map((o) => (
                <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>
              ))}
            </TextField>
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

      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        emptyText="No uploads in this date range"
        height={600}
        initialPageSize={50}
        pageSizeOptions={[25, 50, 100]}
      />
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
