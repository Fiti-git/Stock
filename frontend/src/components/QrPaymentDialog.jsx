import { useEffect, useRef, useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Stack, Typography, Box, CircularProgress, Chip,
} from "@mui/material";
import { getPaymentIntent } from "../api/pos";

/**
 * Renders a payment intent's QR data + payment URL while polling the backend
 * every 2s for terminal status. Calls `onSuccess(intent)` on COMPLETED, and
 * `onFailure(intent)` on FAILED / CANCELLED / EXPIRED. Cancel button just
 * closes the dialog — we don't auto-cancel the intent on the server.
 */
export default function QrPaymentDialog({ intent, open, onClose, onSuccess, onFailure }) {
  const [current, setCurrent] = useState(intent || null);
  const [polling, setPolling] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    setCurrent(intent || null);
    fired.current = false;
  }, [intent?.id]);

  useEffect(() => {
    if (!open || !current?.id) return undefined;
    if (current.status && current.status !== "pending") return undefined;
    let alive = true;
    setPolling(true);
    const tick = async () => {
      try {
        const r = await getPaymentIntent(current.id);
        if (!alive) return;
        setCurrent(r.data);
        const s = r.data?.status;
        if (s && s !== "pending" && !fired.current) {
          fired.current = true;
          if (s === "completed") onSuccess?.(r.data);
          else onFailure?.(r.data);
        }
      } catch {
        // swallow — keep polling
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { alive = false; setPolling(false); clearInterval(id); };
  }, [open, current?.id, current?.status, onSuccess, onFailure]);

  if (!current) return null;
  const status = current.status || "pending";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Scan to Pay — LKR {current.amount}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} alignItems="center" sx={{ py: 1 }}>
          {status === "pending" && (
            <>
              <Box sx={{
                p: 2, border: "1px dashed", borderColor: "divider",
                borderRadius: 2, fontFamily: "monospace", fontSize: 11,
                wordBreak: "break-all", textAlign: "center", maxWidth: "100%",
              }}>
                {current.qr_data || current.payment_url || "(no payload)"}
              </Box>
              {current.payment_url && (
                <Button size="small" href={current.payment_url} target="_blank" rel="noreferrer">
                  Open hosted page
                </Button>
              )}
              <Stack direction="row" spacing={1} alignItems="center">
                {polling && <CircularProgress size={14} />}
                <Typography variant="caption" color="text.secondary">
                  Waiting for confirmation…
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Ref: {current.provider_ref || "—"}
              </Typography>
            </>
          )}
          {status !== "pending" && (
            <Chip
              size="medium"
              color={status === "completed" ? "success" : "error"}
              label={status.toUpperCase()}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{status === "completed" ? "Close" : "Cancel"}</Button>
      </DialogActions>
    </Dialog>
  );
}
