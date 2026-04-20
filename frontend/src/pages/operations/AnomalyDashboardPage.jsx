import { useEffect, useState } from "react";
import {
  Box, Card, CardContent, Typography, Grid, Button, Stack, Chip,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import BrokenImageIcon from "@mui/icons-material/BrokenImage";
import KeyboardReturnIcon from "@mui/icons-material/KeyboardReturn";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import RefreshIcon from "@mui/icons-material/Refresh";
import VisibilityIcon from "@mui/icons-material/Visibility";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { getAnomalies } from "../../api/anomalies";

/**
 * Anomaly dashboard — one card per detection rule. Same card UI vocabulary
 * as the Transactions Hub: coloured icon chip, title, description, severity
 * + count chips, action buttons. Clicking "Details" opens a dialog with the
 * offending rows (the backend ships a `columns` spec per card so we render
 * the right headers generically).
 */
const CARD_META = {
  sales_drop:   { icon: TrendingDownIcon,    accent: "#ef4444" },
  damage_spike: { icon: BrokenImageIcon,     accent: "#f97316" },
  return_spike: { icon: KeyboardReturnIcon,  accent: "#a855f7" },
  high_discount:{ icon: LocalOfferIcon,      accent: "#f59e0b" },
  wastage_red:  { icon: DeleteSweepIcon,     accent: "#dc2626" },
};

const SEVERITY_COLOR = {
  error:   "error",
  warning: "warning",
  success: "success",
};

function lkr(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `LKR ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
function pct(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  return `${n > 0 ? "+" : ""}${n}%`;
}

function formatValue(value, format) {
  if (value == null) return "—";
  if (format === "lkr") return lkr(value);
  if (format === "pct") return pct(value);
  return String(value);
}


function AnomalyCard({ card, onView }) {
  const meta = CARD_META[card.key] || { icon: WarningAmberIcon, accent: "#6b7280" };
  const Icon = meta.icon;
  const severityColor = SEVERITY_COLOR[card.severity] || "default";
  const severityLabel =
    card.severity === "success" ? "All clear" :
    card.severity === "warning" ? "Attention" :
    card.severity === "error"   ? "Action needed" : card.severity;

  return (
    <Card variant="outlined" sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardContent sx={{ flex: 1 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
          <Box
            sx={{
              width: 44, height: 44, borderRadius: 2,
              bgcolor: `${meta.accent}22`, color: meta.accent,
              display: "grid", placeItems: "center",
            }}
          >
            <Icon />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h4" noWrap>{card.label}</Typography>
            <Typography variant="caption" color="text.secondary">{card.description}</Typography>
          </Box>
        </Stack>

        <Box sx={{ mt: 1.5, minHeight: 48 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip
              size="small"
              color={severityColor}
              variant={card.count > 0 ? "filled" : "outlined"}
              label={severityLabel}
            />
            <Chip
              size="small"
              variant="outlined"
              label={`${card.count} ${card.count === 1 ? "flagged" : "flagged"}`}
            />
          </Stack>
        </Box>
      </CardContent>

      <Box sx={{ p: 2, pt: 0 }}>
        <Button
          fullWidth
          variant={card.count > 0 ? "contained" : "outlined"}
          color={card.count > 0 ? (severityColor === "default" ? "primary" : severityColor) : "inherit"}
          startIcon={<VisibilityIcon />}
          disabled={card.count === 0}
          onClick={() => onView(card)}
        >
          {card.count === 0 ? "Nothing flagged" : "View details"}
        </Button>
      </Box>
    </Card>
  );
}


export default function AnomalyDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);   // the card currently opened

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await getAnomalies();
      setData(data);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load anomalies.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const cards = data?.cards || [];
  const windows = data?.windows || {};
  const generated = data?.generated_at;

  return (
    <Layout>
      <PageHeader
        title="Anomaly Dashboard"
        subtitle={
          generated
            ? `Super-admin signals · generated ${new Date(generated).toLocaleString()}`
            : "Super-admin signals derived from the last 7 days of transactions"
        }
        icon={<WarningAmberIcon />}
        actions={
          <Button
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={load}
            disabled={loading}
          >
            Refresh
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading && !data ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Grid container spacing={2}>
            {cards.map((c) => (
              <Grid key={c.key} item xs={12} sm={6} md={4}>
                <AnomalyCard card={c} onView={(card) => setDetail(card)} />
              </Grid>
            ))}
          </Grid>

          {windows?.recent && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: "block" }}>
              Recent window: {windows.recent[0]} to {windows.recent[1]}
              {" · "}Baseline: {windows.baseline?.[0]} to {windows.baseline?.[1]}
              {" · "}Wastage window: {windows.wastage?.[0]} to {windows.wastage?.[1]}
            </Typography>
          )}
        </>
      )}

      {/* Detail dialog */}
      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {detail?.label}
          {detail ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {detail.description}
            </Typography>
          ) : null}
        </DialogTitle>
        <DialogContent dividers>
          {detail && (
            <Box sx={{ overflowX: "auto" }}>
              <Box
                component="table"
                sx={{ fontSize: "0.85rem", width: "100%", borderCollapse: "collapse" }}
              >
                <thead>
                  <tr style={{ textAlign: "left", background: "rgba(0,0,0,0.04)" }}>
                    {detail.columns.map((c) => (
                      <th
                        key={c.field}
                        style={{
                          padding: "8px 12px",
                          textAlign: c.numeric ? "right" : "left",
                        }}
                      >
                        {c.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((row, i) => (
                    <tr key={i} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                      {detail.columns.map((c) => (
                        <td
                          key={c.field}
                          style={{
                            padding: "6px 12px",
                            textAlign: c.numeric ? "right" : "left",
                            fontVariantNumeric: c.numeric ? "tabular-nums" : "normal",
                            fontWeight: c.field === "delta_pct" || c.field === "wastage_pct" ? 600 : "normal",
                            color:
                              c.format === "pct" && Number(row[c.field]) < 0 ? "#b91c1c" :
                              c.format === "pct" && Number(row[c.field]) > 0 && c.field !== "delta_pct" ? "#b45309" :
                              "inherit",
                          }}
                        >
                          {formatValue(row[c.field], c.format)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {detail.items.length === 0 && (
                    <tr>
                      <td colSpan={detail.columns.length} style={{ padding: 24, textAlign: "center", color: "rgba(0,0,0,0.5)" }}>
                        Nothing flagged in this window.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetail(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
