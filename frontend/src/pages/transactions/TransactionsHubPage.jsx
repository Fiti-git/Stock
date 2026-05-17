import { useEffect, useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Box, Grid, Button, Alert, Stack, Typography, Chip, Avatar,
  Card, CardActionArea, Divider, Skeleton,
} from "@mui/material";
import BrokenImageIcon from "@mui/icons-material/BrokenImage";
import AssignmentIcon from "@mui/icons-material/Assignment";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import MoveToInboxIcon from "@mui/icons-material/MoveToInbox";
import KeyboardReturnIcon from "@mui/icons-material/KeyboardReturn";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import AssignmentReturnIcon from "@mui/icons-material/AssignmentReturn";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import HistoryIcon from "@mui/icons-material/History";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { useAuth } from "../../contexts/AuthContext";
import { makeTxnApi } from "../../api/txnApi";
import { getUploadedSheets } from "../../api/uploads";

// ─── palette per pipeline ────────────────────────────────────────────────────
const PIPELINE_META = {
  damage:        { label: "Damage / Wastage",     icon: BrokenImageIcon,       color: "#ef4444", bg: "#fef2f2" },
  office:        { label: "Office Use",           icon: AssignmentIcon,        color: "#64748b", bg: "#f8fafc" },
  verification:  { label: "Verification",         icon: FactCheckOutlinedIcon, color: "#06b6d4", bg: "#ecfeff" },
  grn:           { label: "GRN (Goods Received)", icon: MoveToInboxIcon,       color: "#22c55e", bg: "#f0fdf4" },
  rts:           { label: "Return to Supplier",   icon: KeyboardReturnIcon,    color: "#f59e0b", bg: "#fffbeb" },
  sales:         { label: "Sales (Bill Listing)", icon: PointOfSaleIcon,       color: "#3b82f6", bg: "#eff6ff" },
  sales_returns: { label: "Sales Returns",        icon: AssignmentReturnIcon,  color: "#a855f7", bg: "#faf5ff" },
};

const PIPELINE_KEYS = ["damage", "office", "verification", "grn", "rts", "sales", "sales_returns"];

// ─── POS Snapshot banner ─────────────────────────────────────────────────────
function PosSnapshotBanner({ perms }) {
  const [lastUpload, setLastUpload] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getUploadedSheets({ page: 1, page_size: 1, pipeline: "pos" })
      .then(({ data }) => setLastUpload(data.results?.[0] ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const isToday = lastUpload?.business_date === today;

  const canUpload   = perms.has("nav.upload");
  const canApprove  = perms.has("nav.upload_approvals");
  const canHistory  = perms.has("nav.upload_history");

  return (
    <Card
      elevation={0}
      sx={{
        mb: 4,
        border: "1px solid",
        borderColor: "rgba(99,102,241,0.2)",
        borderRadius: 3,
        overflow: "hidden",
        background: "linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(139,92,246,0.04) 100%)",
      }}
    >
      <Box sx={{ p: { xs: 2.5, md: 3.5 } }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          alignItems={{ xs: "flex-start", md: "center" }}
          justifyContent="space-between"
          spacing={3}
        >
          {/* Left: brand + description */}
          <Stack direction="row" spacing={2.5} alignItems="center">
            <Avatar
              variant="rounded"
              sx={{
                width: 56, height: 56,
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                boxShadow: "0 10px 24px rgba(99,102,241,0.3)",
              }}
            >
              <Inventory2Icon sx={{ fontSize: 28 }} />
            </Avatar>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, color: "#0f172a" }}>
                  POS Snapshot
                </Typography>
                <Chip
                  label="Daily Stock Balance"
                  size="small"
                  sx={{
                    height: 20, fontSize: "0.65rem", fontWeight: 700,
                    bgcolor: "rgba(99,102,241,0.1)", color: "#6366f1",
                    letterSpacing: "0.06em",
                  }}
                />
              </Stack>
              <Typography variant="body2" sx={{ color: "rgba(15,23,42,0.6)", maxWidth: 460 }}>
                Upload the daily stock-balance XLS exported from POS. Each upload creates a snapshot used for variance and shrinkage reports.
              </Typography>
            </Box>
          </Stack>

          {/* Right: last-upload status */}
          <Box sx={{ flexShrink: 0, minWidth: 220 }}>
            {loading ? (
              <Skeleton variant="rounded" width={200} height={48} />
            ) : lastUpload ? (
              <Stack
                direction="row"
                spacing={1.5}
                alignItems="center"
                sx={{
                  px: 2, py: 1.5,
                  bgcolor: isToday ? "#f0fdf4" : "#fffbeb",
                  border: "1px solid",
                  borderColor: isToday ? "#bbf7d0" : "#fde68a",
                  borderRadius: 2,
                }}
              >
                {isToday
                  ? <CheckCircleIcon sx={{ color: "#22c55e", fontSize: 22 }} />
                  : <WarningAmberIcon sx={{ color: "#f59e0b", fontSize: 22 }} />
                }
                <Box>
                  <Typography sx={{ fontSize: "0.72rem", color: "rgba(15,23,42,0.55)", fontWeight: 600 }}>
                    {isToday ? "Uploaded today" : "Last uploaded"}
                  </Typography>
                  <Typography sx={{ fontSize: "0.88rem", fontWeight: 700, color: "#0f172a" }}>
                    {lastUpload.business_date}
                  </Typography>
                </Box>
              </Stack>
            ) : (
              <Stack
                direction="row" spacing={1.5} alignItems="center"
                sx={{ px: 2, py: 1.5, bgcolor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 2 }}
              >
                <CalendarTodayIcon sx={{ color: "#ef4444", fontSize: 22 }} />
                <Typography sx={{ fontSize: "0.88rem", fontWeight: 700, color: "#ef4444" }}>
                  No uploads yet
                </Typography>
              </Stack>
            )}
          </Box>
        </Stack>

        <Divider sx={{ my: 2.5, borderColor: "rgba(99,102,241,0.12)" }} />

        {/* Actions */}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          {canUpload && (
            <Button
              variant="contained"
              startIcon={<UploadFileIcon />}
              onClick={() => navigate("/upload")}
              sx={{
                fontWeight: 700,
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                boxShadow: "0 8px 20px rgba(99,102,241,0.3)",
                "&:hover": { background: "linear-gradient(135deg, #4f46e5, #7c3aed)" },
              }}
            >
              Upload Snapshot
            </Button>
          )}
          {canApprove && (
            <Button
              variant="outlined"
              startIcon={<AssignmentTurnedInIcon />}
              component={RouterLink}
              to="/admin/upload-approvals"
              sx={{ fontWeight: 600, borderColor: "rgba(99,102,241,0.35)", color: "#6366f1" }}
            >
              Approvals
            </Button>
          )}
          {canHistory && (
            <Button
              variant="text"
              startIcon={<HistoryIcon />}
              component={RouterLink}
              to="/upload/history"
              sx={{ fontWeight: 600, color: "rgba(15,23,42,0.65)" }}
            >
              View History
            </Button>
          )}
        </Stack>
      </Box>
    </Card>
  );
}

// ─── single transaction-type card ────────────────────────────────────────────
function TxnCard({ pipelineKey }) {
  const meta = PIPELINE_META[pipelineKey];
  const Icon = meta.icon;
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    makeTxnApi(pipelineKey).getStats()
      .then(({ data }) => setStats(data))
      .catch(() => setStats({ error: true }))
      .finally(() => setLoading(false));
  }, [pipelineKey]);

  const latest     = stats?.latest;
  const pending    = stats?.pending_count ?? 0;
  const total      = stats?.total_batches ?? 0;
  const gaps       = stats?.missing_dates_count ?? 0;

  return (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        border: "1px solid rgba(15,23,42,0.08)",
        borderRadius: 2.5,
        transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
        "&:hover": {
          transform: "translateY(-3px)",
          boxShadow: `0 16px 40px -12px ${meta.color}33`,
          borderColor: meta.color,
        },
      }}
    >
      <Box sx={{ p: 2.5, display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Header */}
        <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 2 }}>
          <Avatar
            variant="rounded"
            sx={{
              width: 44, height: 44, flexShrink: 0,
              bgcolor: meta.bg,
              color: meta.color,
              border: `1px solid ${meta.color}22`,
            }}
          >
            <Icon sx={{ fontSize: 22 }} />
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a", lineHeight: 1.2 }} noWrap>
              {meta.label}
            </Typography>
            {!loading && latest && (
              <Typography sx={{ fontSize: "0.75rem", color: "rgba(15,23,42,0.5)", mt: 0.25 }}>
                Last: {latest.date_from === latest.date_to
                  ? latest.date_from
                  : `${latest.date_from} → ${latest.date_to}`}
              </Typography>
            )}
            {!loading && !latest && !stats?.error && (
              <Typography sx={{ fontSize: "0.75rem", color: "rgba(15,23,42,0.4)", mt: 0.25 }}>
                No uploads yet
              </Typography>
            )}
          </Box>
        </Stack>

        {/* Stats row */}
        {loading ? (
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Skeleton variant="rounded" width={56} height={24} />
            <Skeleton variant="rounded" width={56} height={24} />
          </Stack>
        ) : (
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            <Chip
              size="small"
              label={`${total} batch${total === 1 ? "" : "es"}`}
              sx={{ height: 22, fontSize: "0.7rem", bgcolor: "#f1f5f9", color: "#475569" }}
            />
            {pending > 0 && (
              <Chip
                size="small"
                label={`${pending} pending`}
                sx={{ height: 22, fontSize: "0.7rem", bgcolor: "#fffbeb", color: "#d97706", border: "1px solid #fde68a" }}
              />
            )}
            {gaps > 0 && (
              <Chip
                size="small"
                label={`${gaps} gap${gaps === 1 ? "" : "s"}`}
                sx={{ height: 22, fontSize: "0.7rem", bgcolor: "#eff6ff", color: "#3b82f6", border: "1px solid #bfdbfe" }}
              />
            )}
          </Stack>
        )}

        <Box sx={{ flex: 1 }} />

        {/* Actions */}
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="contained"
            startIcon={<UploadFileIcon sx={{ fontSize: "0.9rem !important" }} />}
            onClick={() => navigate(`/transactions/${pipelineKey}/upload`)}
            sx={{
              flex: 1,
              fontWeight: 700,
              fontSize: "0.78rem",
              bgcolor: meta.color,
              boxShadow: "none",
              "&:hover": { bgcolor: meta.color, filter: "brightness(0.9)", boxShadow: "none" },
            }}
          >
            Upload
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<HistoryIcon sx={{ fontSize: "0.9rem !important" }} />}
            component={RouterLink}
            to={`/transactions/${pipelineKey}/history`}
            sx={{
              flex: 1,
              fontWeight: 600,
              fontSize: "0.78rem",
              borderColor: "rgba(15,23,42,0.15)",
              color: "rgba(15,23,42,0.65)",
              "&:hover": { borderColor: meta.color, color: meta.color },
            }}
          >
            History
          </Button>
        </Stack>
      </Box>
    </Card>
  );
}

// ─── Uploaded Sheets shortcut banner ─────────────────────────────────────────
function UploadedSheetsBanner() {
  return (
    <CardActionArea
      component={RouterLink}
      to="/uploaded-sheets"
      sx={{
        mt: 4,
        borderRadius: 2,
        overflow: "hidden",
        border: "1px solid rgba(15,23,42,0.08)",
        background: "#f8fafc",
        display: "flex",
        alignItems: "center",
        px: 3, py: 2,
        gap: 2,
        transition: "border-color 160ms ease, background 160ms ease",
        "&:hover": { background: "#f1f5f9", borderColor: "rgba(15,23,42,0.18)" },
      }}
    >
      <Avatar variant="rounded" sx={{ bgcolor: "#e2e8f0", color: "#475569", width: 40, height: 40 }}>
        <ReceiptLongIcon />
      </Avatar>
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontWeight: 700, fontSize: "0.9rem", color: "#0f172a" }}>
          All Uploaded Sheets
        </Typography>
        <Typography sx={{ fontSize: "0.78rem", color: "rgba(15,23,42,0.55)" }}>
          Browse, filter and review every uploaded sheet across all pipelines.
        </Typography>
      </Box>
      <ArrowForwardIcon sx={{ color: "rgba(15,23,42,0.35)", fontSize: 20 }} />
    </CardActionArea>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function TransactionsHubPage() {
  const { user } = useAuth();
  const perms = new Set(user?.permissions || []);

  const hasPosSection = perms.has("nav.upload") || perms.has("nav.upload_approvals") || perms.has("nav.upload_history");

  return (
    <Layout>
      <PageHeader
        title="Transactions"
        subtitle="Upload and review daily stock movements — POS snapshots, GRN, damage, sales and more."
        icon={<ReceiptLongIcon />}
      />

      {/* POS Snapshot ── featured section */}
      {hasPosSection && <PosSnapshotBanner perms={perms} />}

      {/* Transaction report uploads */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography
            sx={{
              fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", color: "rgba(15,23,42,0.45)",
            }}
          >
            Stock Movement Reports
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: "0.78rem", color: "rgba(15,23,42,0.45)" }}>
          {PIPELINE_KEYS.length} pipelines
        </Typography>
      </Stack>

      <Grid container spacing={2.5}>
        {PIPELINE_KEYS.map((key) => (
          <Grid key={key} item xs={12} sm={6} md={4}>
            <TxnCard pipelineKey={key} />
          </Grid>
        ))}
      </Grid>

      {/* All Uploaded Sheets shortcut */}
      <UploadedSheetsBanner />
    </Layout>
  );
}
