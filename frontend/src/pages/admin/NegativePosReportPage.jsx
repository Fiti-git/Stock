import { useState, useEffect, useRef } from "react";
import {
  Box, Stack, TextField, Button, Card, CardContent, Typography,
  Grid, Alert, Chip,
} from "@mui/material";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";
import DownloadIcon from "@mui/icons-material/Download";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { getNegativePosReport } from "../../api/items";
import { useOutlet } from "../../contexts/OutletContext";

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmt = (n, d = 2) => n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

function downloadCSV(date, outlets) {
  const rows = [["Date", "Outlet", "Item Code", "Item Name", "POS Qty", "Selling Price", "Cost Price", "Line Cost Value"]];
  for (const o of outlets) {
    for (const item of o.items) {
      rows.push([date, o.outlet_name, item.item_code, `"${item.item_name.replace(/"/g, '""')}"`, item.pos_quantity, item.selling_price ?? "", item.cost_price, item.line_cost_value]);
    }
    rows.push([date, o.outlet_name, "", "TOTAL COST VALUE", "", "", "", o.total_cost_value]);
  }
  const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `negative-pos-${date}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function NegativePosReportPage() {
  const { outletId } = useOutlet();
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const outletRefs = useRef({});

  useEffect(() => {
    if (!date) return;
    setLoading(true); setError(null); setData(null);
    getNegativePosReport(date, outletId || null)
      .then((r) => setData(r.data))
      .catch(() => setError("Failed to load report."))
      .finally(() => setLoading(false));
  }, [date, outletId]);

  const reportOutlets = data?.outlets ?? [];
  const totalItems = reportOutlets.reduce((s, o) => s + o.items.length, 0);
  const grandTotal = reportOutlets.reduce((s, o) => s + o.total_cost_value, 0);

  const itemColumns = [
    { field: "item_code", headerName: "Code", flex: 0.7, minWidth: 110 },
    { field: "item_name", headerName: "Name", flex: 1.6, minWidth: 200 },
    { field: "pos_quantity", headerName: "POS Qty", type: "number", flex: 0.6, minWidth: 100, renderCell: (p) => <Box sx={{ color: "error.main", fontWeight: 600 }}>{fmt(p.value, 3)}</Box> },
    { field: "selling_price", headerName: "Sell", type: "number", flex: 0.6, minWidth: 90, valueGetter: (v) => fmt(v) },
    { field: "cost_price", headerName: "Cost", type: "number", flex: 0.6, minWidth: 90, valueGetter: (v) => fmt(v) },
    { field: "line_cost_value", headerName: "Cost Value", type: "number", flex: 0.7, minWidth: 110, valueGetter: (v) => fmt(v) },
  ];

  return (
    <Layout>
      <PageHeader
        title="Negative POS Report"
        subtitle="Items with negative POS quantity, grouped by outlet"
        icon={<ReportProblemIcon />}
        actions={
          data && reportOutlets.length > 0 && (
            <Button variant="contained" startIcon={<DownloadIcon />} onClick={() => downloadCSV(data.date, reportOutlets)}>
              Download CSV
            </Button>
          )
        }
      />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }} alignItems={{ sm: "center" }}>
        <TextField size="small" type="date" label="Date" InputLabelProps={{ shrink: true }} value={date} onChange={(e) => setDate(e.target.value)} />
        {data && totalItems > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
            {totalItems} item{totalItems !== 1 ? "s" : ""} across {reportOutlets.length} outlet{reportOutlets.length !== 1 ? "s" : ""}
          </Typography>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && data && reportOutlets.length === 0 && (
        <Card variant="outlined"><CardContent>
          <Typography align="center" color="text.secondary" sx={{ py: 4 }}>No items with negative POS quantity on {date}.</Typography>
        </CardContent></Card>
      )}

      {reportOutlets.length > 0 && (
        <>
          <Alert severity="error" variant="outlined" sx={{ mb: 3, alignItems: "center" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" width="100%">
              <span>Grand Total Cost Value (all outlets)</span>
              <Typography variant="h4" color="error.main">{fmt(grandTotal)}</Typography>
            </Stack>
          </Alert>

          <Grid container spacing={1.5} sx={{ mb: 3 }}>
            {reportOutlets.map((o) => (
              <Grid key={o.outlet_id} item xs={6} sm={4} md={3}>
                <Card variant="outlined" sx={{ cursor: "pointer", "&:hover": { borderColor: "error.main" } }} onClick={() => outletRefs.current[o.outlet_id]?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                  <CardContent sx={{ p: 2 }}>
                    <Typography variant="caption" color="text.secondary" noWrap>{o.outlet_name}</Typography>
                    <Typography variant="h4" color="error.main">{fmt(o.total_cost_value)}</Typography>
                    <Chip size="small" variant="outlined" label={`${o.items.length} item${o.items.length !== 1 ? "s" : ""}`} />
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {reportOutlets.map((o) => (
            <Box key={o.outlet_id} ref={(el) => { outletRefs.current[o.outlet_id] = el; }} sx={{ mb: 3, scrollMarginTop: "80px" }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h4">{o.outlet_name}</Typography>
                <Typography variant="caption" color="text.secondary">{o.items.length} item{o.items.length !== 1 ? "s" : ""} · Total: <b>{fmt(o.total_cost_value)}</b></Typography>
              </Stack>
              <DataTable rows={o.items} columns={itemColumns} getRowId={(r) => r.item_code} toolbar={false} height={Math.min(560, 120 + o.items.length * 44)} initialPageSize={10} pageSizeOptions={[10, 25, 50]} />
            </Box>
          ))}
        </>
      )}
    </Layout>
  );
}
