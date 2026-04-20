import { useEffect, useState } from "react";
import {
  Box, Paper, Typography, CircularProgress, Alert,
  ToggleButton, ToggleButtonGroup, Stack, TextField, MenuItem,
} from "@mui/material";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import ReportFilterBar from "../../components/operations/ReportFilterBar";
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

      <Paper variant="outlined" sx={{ overflow: "auto" }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "rgba(0,0,0,0.04)", textAlign: "left" }}>
                <th style={{ padding: "8px 12px", width: 40 }}>#</th>
                <th style={{ padding: "8px 12px" }}>Item Code</th>
                <th style={{ padding: "8px 12px" }}>Description</th>
                {isDead ? (
                  <>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Bought Qty</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Bought Value</th>
                  </>
                ) : (
                  <>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Qty</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Revenue</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Cost</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Gross Margin</th>
                    <th style={{ padding: "8px 12px", textAlign: "right" }}>Invoices</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.item_code + i} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                  <td style={{ padding: "6px 12px", color: "rgba(0,0,0,0.6)" }}>{i + 1}</td>
                  <td style={{ padding: "6px 12px", fontFamily: "monospace" }}>{r.item_code}</td>
                  <td style={{ padding: "6px 12px" }}>{r.description || "—"}</td>
                  {isDead ? (
                    <>
                      <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Number(r.bought_qty || 0).toLocaleString()}</td>
                      <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#b91c1c", fontWeight: 600 }}>{lkr(r.bought_value)}</td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Number(r.sold_qty || 0).toLocaleString()}</td>
                      <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{lkr(r.sold_revenue)}</td>
                      <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "rgba(0,0,0,0.6)" }}>{lkr(r.total_cost)}</td>
                      <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#166534" }}>{lkr(r.gross_margin)}</td>
                      <td style={{ padding: "6px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.invoices}</td>
                    </>
                  )}
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={isDead ? 5 : 8} style={{ padding: 24, textAlign: "center", color: "rgba(0,0,0,0.5)" }}>
                    {isDead ? "No dead stock found — every purchased item was sold in this window." : "No sales in this window."}
                  </td>
                </tr>
              )}
            </tbody>
          </Box>
        )}
      </Paper>
    </Layout>
  );
}
