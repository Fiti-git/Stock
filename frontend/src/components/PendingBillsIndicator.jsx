import { useEffect, useState, useCallback } from "react";
import {
  Badge, IconButton, Drawer, Box, Typography, Stack, Chip, Button, Divider, Tooltip,
} from "@mui/material";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import RefreshIcon from "@mui/icons-material/Refresh";
import { listPendingBills } from "../lib/offlineQueue";
import { drainQueue, subscribeQueueChanges } from "../lib/offlineSync";
import apiClient from "../api/client";

function statusColor(status) {
  switch (status) {
    case "queued": return "default";
    case "syncing": return "info";
    case "done": return "success";
    case "failed": return "error";
    default: return "default";
  }
}

function billTotal(payload) {
  if (!payload) return 0;
  // Try to compute from lines + bill_discount.
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const sub = lines.reduce((s, l) => {
    const qty = Number(l.qty) || 0;
    const price = Number(l.unit_price) || 0;
    const ld = Number(l.line_discount) || 0;
    return s + qty * price - ld;
  }, 0);
  const billDisc = Number(payload.bill_discount) || 0;
  return Math.max(0, sub - billDisc);
}

function fmtTime(ts) {
  if (!ts) return "";
  try { return new Date(ts).toLocaleTimeString(); } catch { return ""; }
}

export default function PendingBillsIndicator() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [retrying, setRetrying] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await listPendingBills();
      // Hide already-done rows older than a moment from the indicator count,
      // but keep them in the list so the user sees recent successes.
      setRows(list);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refresh();
    const unsub = subscribeQueueChanges(refresh);
    const id = window.setInterval(refresh, 5000);
    return () => { unsub(); window.clearInterval(id); };
  }, [refresh]);

  const pendingCount = rows.filter(
    (r) => r.status === "queued" || r.status === "syncing"
  ).length;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await drainQueue(apiClient);
      await refresh();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <>
      <Tooltip title={pendingCount ? `${pendingCount} bill(s) waiting to sync` : "Offline queue"}>
        <IconButton color={pendingCount ? "warning" : "default"} onClick={() => setOpen(true)}>
          <Badge badgeContent={pendingCount} color="warning">
            <CloudOffIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
        <Box sx={{ width: 380, p: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <Typography variant="h6" sx={{ flex: 1 }}>Offline bill queue</Typography>
            <Button
              size="small"
              startIcon={<RefreshIcon />}
              onClick={handleRetry}
              disabled={retrying}
            >
              Retry now
            </Button>
          </Stack>
          <Divider sx={{ mb: 2 }} />

          {rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No queued bills. All synced.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {rows.map((r) => (
                <Box
                  key={r.id}
                  sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 1 }}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
                      LKR {billTotal(r.payload).toFixed(2)}
                    </Typography>
                    <Chip size="small" label={r.status} color={statusColor(r.status)} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Queued: {fmtTime(r.queuedAt)}
                    {r.attempts ? ` · ${r.attempts} attempt${r.attempts === 1 ? "" : "s"}` : ""}
                  </Typography>
                  {r.lastError && (
                    <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>
                      {String(r.lastError).slice(0, 200)}
                    </Typography>
                  )}
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Drawer>
    </>
  );
}
