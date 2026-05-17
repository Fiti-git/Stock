import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Box, Typography, Stack, ButtonBase } from "@mui/material";
import BrokenImageIcon from "@mui/icons-material/BrokenImage";
import AssignmentIcon from "@mui/icons-material/Assignment";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import MoveToInboxIcon from "@mui/icons-material/MoveToInbox";
import KeyboardReturnIcon from "@mui/icons-material/KeyboardReturn";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import AssignmentReturnIcon from "@mui/icons-material/AssignmentReturn";
import Layout from "../../components/Layout";
import TransactionUploadPage from "../../components/transactions/TransactionUploadPage";
import { makeTxnApi } from "../../api/txnApi";

const PIPELINES = [
  {
    key: "damage",
    label: "Damage / Wastage",
    Icon: BrokenImageIcon,
    color: "#ef4444",
    historyPath: "/transactions/damage/history",
  },
  {
    key: "office",
    label: "Office Use",
    Icon: AssignmentIcon,
    color: "#64748b",
    historyPath: "/transactions/office/history",
  },
  {
    key: "verification",
    label: "Verification",
    Icon: FactCheckOutlinedIcon,
    color: "#06b6d4",
    historyPath: "/transactions/verification/history",
  },
  {
    key: "grn",
    label: "GRN",
    Icon: MoveToInboxIcon,
    color: "#22c55e",
    historyPath: "/transactions/grn/history",
  },
  {
    key: "rts",
    label: "Return to Supplier",
    Icon: KeyboardReturnIcon,
    color: "#f59e0b",
    historyPath: "/transactions/rts/history",
  },
  {
    key: "sales",
    label: "Sales",
    Icon: PointOfSaleIcon,
    color: "#3b82f6",
    historyPath: "/transactions/sales/history",
  },
  {
    key: "sales_returns",
    label: "Sales Returns",
    Icon: AssignmentReturnIcon,
    color: "#a855f7",
    historyPath: "/transactions/sales_returns/history",
  },
];

export default function UploadHubPage() {
  const location = useLocation();
  const prefill = location.state || {};

  const [active, setActive] = useState(
    () => PIPELINES.find((p) => p.key === prefill.pipeline) || PIPELINES[0]
  );

  // Reset active pipeline if navigation state changes (e.g. fresh re-upload nav)
  useEffect(() => {
    if (prefill.pipeline) {
      const match = PIPELINES.find((p) => p.key === prefill.pipeline);
      if (match) setActive(match);
    }
  }, [prefill.pipeline]);

  const config = {
    label: active.label,
    icon: <active.Icon />,
    api: makeTxnApi(active.key),
    historyPath: active.historyPath,
    prefillDateFrom: active.key === (prefill.pipeline || "") ? (prefill.dateFrom || "") : "",
    prefillDateTo: active.key === (prefill.pipeline || "") ? (prefill.dateTo || "") : "",
    prefillOutletId: prefill.outletId || null,
  };

  return (
    <Layout>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "220px 1fr" },
          gap: 3,
          alignItems: "start",
        }}
      >
        {/* Left: pipeline selector */}
        <Box
          sx={{
            border: "1px solid rgba(15,23,42,0.1)",
            borderRadius: 2,
            bgcolor: "#fff",
            overflow: "hidden",
          }}
        >
          <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid rgba(15,23,42,0.08)" }}>
            <Typography
              sx={{
                fontSize: "0.7rem", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.14em",
                color: "rgba(15,23,42,0.45)",
              }}
            >
              Pipeline
            </Typography>
          </Box>
          {PIPELINES.map((p) => {
            const isActive = p.key === active.key;
            return (
              <ButtonBase
                key={p.key}
                onClick={() => setActive(p)}
                sx={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: 2,
                  py: 1.5,
                  textAlign: "left",
                  borderLeft: isActive ? `3px solid ${p.color}` : "3px solid transparent",
                  bgcolor: isActive ? `${p.color}0e` : "transparent",
                  "&:hover": { bgcolor: isActive ? `${p.color}18` : "#f8fafc" },
                  transition: "all 150ms ease",
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1.25}>
                  <Box
                    sx={{
                      width: 30, height: 30, borderRadius: 1,
                      display: "grid", placeItems: "center",
                      bgcolor: isActive ? `${p.color}20` : "rgba(15,23,42,0.05)",
                      color: isActive ? p.color : "rgba(15,23,42,0.4)",
                      flexShrink: 0,
                    }}
                  >
                    <p.Icon sx={{ fontSize: 16 }} />
                  </Box>
                  <Typography
                    sx={{
                      fontSize: "0.82rem",
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? "#0f172a" : "rgba(15,23,42,0.6)",
                      lineHeight: 1.3,
                    }}
                  >
                    {p.label}
                  </Typography>
                </Stack>
              </ButtonBase>
            );
          })}
        </Box>

        {/* Right: upload form — key forces remount on pipeline switch */}
        <Box key={active.key}>
          <TransactionUploadPage config={config} embedded
            prefillDateFrom={config.prefillDateFrom}
            prefillDateTo={config.prefillDateTo}
            prefillOutletId={config.prefillOutletId}
          />
        </Box>
      </Box>
    </Layout>
  );
}
