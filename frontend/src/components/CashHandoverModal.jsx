import { useState, useEffect } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Stack, TextField, Button, Typography, Alert, Box,
} from "@mui/material";
import { createCashHandover, listShifts } from "../api/pos";
import { useNotification } from "../providers/NotificationProvider";

/**
 * Follow-up step after a Z-report / shift close.
 *
 * Manager records cash physically collected from the till. Server computes
 * expected_cash from shift aggregates and stores variance.
 */
export default function CashHandoverModal({ open, onClose, shift, onSubmitted }) {
  const { notify } = useNotification();
  const [counted, setCounted] = useState("");
  const [safeRef, setSafeRef] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expected, setExpected] = useState(null);
  const [cashierName, setCashierName] = useState("");

  useEffect(() => {
    if (!open || !shift) return;
    setCounted("");
    setSafeRef("");
    setNote("");
    // The shift object passed from the close-shift dialog already holds
    // expected_cash (annotated server-side). If not, we pull a fresh copy.
    if (shift.expected_cash !== undefined && shift.expected_cash !== null) {
      setExpected(Number(shift.expected_cash));
      setCashierName(shift.opened_by_username || "");
      return;
    }
    listShifts({ status: "closed" })
      .then((r) => {
        const s = (r.data.results || []).find((x) => x.id === shift.id);
        if (s) {
          setExpected(Number(s.expected_cash));
          setCashierName(s.opened_by_username || "");
        }
      })
      .catch(() => {});
  }, [open, shift]);

  const variance = counted === "" || expected === null
    ? null
    : Number(counted) - expected;

  const submit = async () => {
    if (counted === "") {
      notify("Enter the counted cash amount.", "warning");
      return;
    }
    setSubmitting(true);
    try {
      const r = await createCashHandover({
        shift_id: shift.id,
        counted_cash: counted,
        safe_deposit_ref: safeRef,
        note,
      });
      notify(`Cash handover recorded (variance ${r.data.variance}).`, "success");
      onSubmitted?.(r.data);
      onClose?.();
    } catch (err) {
      notify(err?.response?.data?.detail || "Handover failed.", "error");
    } finally { setSubmitting(false); }
  };

  if (!shift) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Cash Handover · Shift #{shift.id}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Cashier</Typography>
            <Typography variant="body1">{cashierName || shift.opened_by_username || "—"}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Expected cash (system)</Typography>
            <Typography variant="h6">{expected === null ? "…" : expected.toFixed(2)}</Typography>
          </Box>
          <TextField
            label="Counted cash" type="number" inputProps={{ step: "0.01" }}
            value={counted} onChange={(e) => setCounted(e.target.value)} required fullWidth autoFocus
          />
          {variance !== null && (
            <Alert severity={variance === 0 ? "success" : (Math.abs(variance) < 100 ? "warning" : "error")}>
              Variance: {variance.toFixed(2)}
            </Alert>
          )}
          <TextField label="Safe deposit slip ref (optional)" value={safeRef}
            onChange={(e) => setSafeRef(e.target.value)} fullWidth />
          <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)}
            fullWidth multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Skip</Button>
        <Button variant="contained" onClick={submit} disabled={submitting}>Collect</Button>
      </DialogActions>
    </Dialog>
  );
}
