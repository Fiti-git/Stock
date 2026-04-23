import { useEffect, useState } from "react";
import {
  Typography, Grid, Card, CardContent, Alert,
} from "@mui/material";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import ReportFilterBar from "../../components/operations/ReportFilterBar";
import PaginatedTable from "../../components/operations/PaginatedTable";
import { getDailySalesReport } from "../../api/reports";

function lkr(n) {
  return `LKR ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA");
}

export default function DailySalesReportPage() {
  const today = new Date().toLocaleDateString("en-CA");
  const [filter, setFilter] = useState({ fromDate: isoDaysAgo(29), toDate: today, outletId: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getDailySalesReport(filter);
      setData(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  const totals = data?.totals || {};
  const kpis = [
    { label: "Bills",         value: totals.bills ?? 0 },
    { label: "Gross sales",   value: lkr(totals.gross_sales) },
    { label: "Discount",      value: lkr(totals.discount), color: "warning.main" },
    { label: "Returns",       value: lkr(totals.returns_value), color: "error.main" },
    { label: "Net sales",     value: lkr(totals.net_sales), color: "success.main" },
  ];

  return (
    <Layout>
      <PageHeader
        title="Daily Sales Summary"
        subtitle="Super-admin report · bills / gross / returns / net per outlet per day"
        icon={<PointOfSaleIcon />}
      />

      <ReportFilterBar
        value={filter}
        onChange={setFilter}
        onApply={load}
        loading={loading}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {kpis.map((k) => (
          <Grid item key={k.label} xs={6} md={true}>
            <Card variant="outlined">
              <CardContent sx={{ py: 1.5 }}>
                <Typography variant="caption" color="text.secondary">{k.label}</Typography>
                <Typography variant="h4" sx={{ color: k.color || "text.primary", mt: 0.5 }}>
                  {k.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <PaginatedTable
        loading={loading}
        rows={data?.rows || []}
        getRowKey={(r, i) => `${r.outlet_id}-${r.date}-${i}`}
        emptyText="No sales data in this window."
        columns={[
          { header: "Date",     render: (r) => r.date },
          { header: "Outlet",   render: (r) => r.outlet_name || "—" },
          { header: "Bills",    align: "right", render: (r) => r.bills },
          { header: "Items",    align: "right", render: (r) => Number(r.items || 0).toLocaleString() },
          { header: "Gross",    align: "right", render: (r) => lkr(r.gross_sales) },
          { header: "Discount", align: "right", render: (r) => lkr(r.discount),       cellStyle: () => ({ color: "#b45309" }) },
          { header: "Returns",  align: "right", render: (r) => lkr(r.returns_value),  cellStyle: (r) => ({ color: r.returns_value < 0 ? "#b91c1c" : "inherit" }) },
          { header: "Net",      align: "right", render: (r) => lkr(r.net_sales),      cellStyle: () => ({ fontWeight: 600 }) },
          { header: "Avg Bill", align: "right", render: (r) => lkr(r.avg_bill_value) },
        ]}
      />
    </Layout>
  );
}
