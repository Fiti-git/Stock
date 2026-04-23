import { useEffect, useState } from "react";
import {
  Alert, ToggleButton, ToggleButtonGroup, Stack, TextField, MenuItem,
} from "@mui/material";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import ReportFilterBar from "../../components/operations/ReportFilterBar";
import PaginatedTable from "../../components/operations/PaginatedTable";
import { getItemRankingsReport } from "../../api/reports";

function lkr(n) {
  return `LKR ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA");
}

export default function ItemRankingsReportPage() {
  const today = new Date().toLocaleDateString("en-CA");
  const [filter, setFilter] = useState({ fromDate: isoDaysAgo(29), toDate: today, outletId: "" });
  const [mode, setMode] = useState("sold");      // "sold" | "dead"
  const [order, setOrder] = useState("top");     // "top" | "bottom"
  const [metric, setMetric] = useState("revenue"); // "revenue" | "qty" | "margin"
  const [limit, setLimit] = useState(50);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getItemRankingsReport({ ...filter, mode, order, metric, limit });
      setData(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load report.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [mode, order, metric, limit]); // eslint-disable-line

  const rows = data?.rows || [];
  const isDead = mode === "dead";

  return (
    <Layout>
      <PageHeader
        title={isDead ? "Dead Stock (bought but unsold)" : "Top / Bottom Sellers"}
        subtitle="Super-admin report · ranked items for the selected window"
        icon={<LeaderboardIcon />}
      />

      <ReportFilterBar value={filter} onChange={setFilter} onApply={load} loading={loading} />

      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }} alignItems={{ md: "center" }}>
        <ToggleButtonGroup
          size="small" exclusive color="primary"
          value={mode}
          onChange={(_, v) => v && setMode(v)}
        >
          <ToggleButton value="sold">Sold items</ToggleButton>
          <ToggleButton value="dead">Dead stock</ToggleButton>
        </ToggleButtonGroup>

        {!isDead && (
          <>
            <ToggleButtonGroup
              size="small" exclusive color="primary"
              value={order}
              onChange={(_, v) => v && setOrder(v)}
            >
              <ToggleButton value="top">Top N</ToggleButton>
              <ToggleButton value="bottom">Bottom N</ToggleButton>
            </ToggleButtonGroup>
            <TextField
              size="small" select label="Rank by"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="revenue">Revenue</MenuItem>
              <MenuItem value="qty">Quantity</MenuItem>
              <MenuItem value="margin">Gross margin</MenuItem>
            </TextField>
          </>
        )}

        <TextField
          size="small" select label="Limit"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          sx={{ minWidth: 100 }}
        >
          {[25, 50, 100, 200].map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
        </TextField>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <PaginatedTable
        loading={loading}
        rows={rows}
        getRowKey={(r, i) => `${r.item_code}-${i}`}
        emptyText={isDead ? "No dead stock found — every purchased item was sold in this window." : "No sales in this window."}
        columns={isDead ? [
          { header: "#",            width: 40, render: (_r, i) => i + 1, cellStyle: () => ({ color: "rgba(0,0,0,0.6)" }) },
          { header: "Item Code",    mono: true, render: (r) => r.item_code },
          { header: "Description",  render: (r) => r.description || "—" },
          { header: "Bought Qty",   align: "right", render: (r) => Number(r.bought_qty || 0).toLocaleString() },
          { header: "Bought Value", align: "right", render: (r) => lkr(r.bought_value), cellStyle: () => ({ color: "#b91c1c", fontWeight: 600 }) },
        ] : [
          { header: "#",            width: 40, render: (_r, i) => i + 1, cellStyle: () => ({ color: "rgba(0,0,0,0.6)" }) },
          { header: "Item Code",    mono: true, render: (r) => r.item_code },
          { header: "Description",  render: (r) => r.description || "—" },
          { header: "Qty",          align: "right", render: (r) => Number(r.sold_qty || 0).toLocaleString() },
          { header: "Revenue",      align: "right", render: (r) => lkr(r.sold_revenue), cellStyle: () => ({ fontWeight: 600 }) },
          { header: "Cost",         align: "right", render: (r) => lkr(r.total_cost),  cellStyle: () => ({ color: "rgba(0,0,0,0.6)" }) },
          { header: "Gross Margin", align: "right", render: (r) => lkr(r.gross_margin), cellStyle: () => ({ color: "#166534" }) },
          { header: "Invoices",     align: "right", render: (r) => r.invoices },
        ]}
      />
    </Layout>
  );
}
