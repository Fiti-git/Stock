import { useState, useEffect, useRef } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Button, Stack, Alert, Typography, Box,
} from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import apiClient from "../api/client";

/**
 * ManagerPinModal — prompts a manager to enter their PIN to authorise an
 * over-cap discount (or other future kinds). On success calls
 * onApproved(approval_token) and closes.
 *
 * Props:
 *   open       — bool
 *   onClose    — () => void
 *   onApproved — (token: string) => void
 *   context    — { kind: "discount", amount: number|string, outlet_id: number }
 */
export default function ManagerPinModal({ open, onClose, onApproved, context }) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(0); // epoch ms
  const [now, setNow] = useState(Date.now());
  const pinRef = useRef(null);

  useEffect(() => {
    if (open) {
      setUsername("");
      setPin("");
      setError("");
      setSubmitting(false);
      setLockedUntil(0);
    }
  }, [open]);

  // Tick every second when locked so the countdown updates.
  useEffect(() => {
    if (!lockedUntil) return undefined;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const isLocked = lockedUntil > now;
  const lockSecondsLeft = isLocked ? Math.ceil((lockedUntil - now) / 1000) : 0;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (isLocked || submitting) return;
    if (!username.trim()) { setError("Manager username required."); return; }
    if (!/^\d{4,6}$/.test(pin)) { setError("PIN must be 4–6 digits."); return; }

    setSubmitting(true);
    setError("");
    try {
      const { data } = await apiClient.post("/pos/verify-manager-pin/", {
        manager_username: username.trim(),
        pin,
        context: {
          kind: context?.kind || "discount",
          outlet_id: context?.outlet_id,
          amount: String(context?.amount ?? "0"),
        },
      });
      onApproved?.(data.approval_token);
      onClose?.();
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data || {};
      if (status === 423 || status === 429) {
        const retry = Number(data.retry_after) || 60;
        setLockedUntil(Date.now() + retry * 1000);
        setError(`Locked. Try again in ${retry}s.`);
      } else if (status === 401) {
        const left = data.attempts_left;
        setError(
          typeof left === "number"
            ? `Invalid PIN. Attempts remaining: ${left}`
            : "Invalid PIN."
        );
        setPin("");
      } else {
        setError(data.detail || "Verification failed.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center">
          <LockIcon fontSize="small" />
          <span>Manager Approval</span>
        </Stack>
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              This {context?.kind || "action"} of LKR{" "}
              <strong>{Number(context?.amount || 0).toFixed(2)}</strong>{" "}
              exceeds the policy cap. A manager must enter their PIN to authorise.
            </Typography>
            <TextField
              label="Manager username"
              size="small"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="off"
              disabled={isLocked || submitting}
            />
            <TextField
              label="PIN"
              size="small"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputRef={pinRef}
              inputProps={{ inputMode: "numeric", pattern: "[0-9]*", maxLength: 6 }}
              disabled={isLocked || submitting}
            />
            {error && (
              <Alert severity={isLocked ? "warning" : "error"}>
                {isLocked ? `Locked. Try again in ${lockSecondsLeft}s.` : error}
              </Alert>
            )}
            <Box className="text-xs text-gray-500">
              PIN is verified server-side. The cashier never sees the PIN.
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isLocked || submitting}
          >
            {submitting ? "Verifying…" : "Authorise"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
