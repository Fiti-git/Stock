import { useState } from "react";
import { Stack, TextField, Button, Typography, Box, Chip, Alert } from "@mui/material";
import CardGiftcardIcon from "@mui/icons-material/CardGiftcard";
import { getGiftCard } from "../api/pos";

/**
 * GiftCardInput — look up a gift card by serial and apply it as a payment.
 *
 * Props:
 *   amountDue number — remaining outstanding amount on the bill
 *   onAdded   (serial, redeemAmount, balance) => void
 */
export default function GiftCardInput({ amountDue, onAdded }) {
  const [serial, setSerial] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [card, setCard] = useState(null); // {serial, current_balance, status}

  const reset = () => {
    setSerial("");
    setCard(null);
    setError("");
  };

  const lookup = async () => {
    const s = serial.trim();
    if (!s) return;
    setBusy(true);
    setError("");
    setCard(null);
    try {
      const res = await getGiftCard(s);
      const d = res.data || {};
      if (d.status && d.status !== "ACTIVE") {
        setError(`Card is ${d.status}.`);
        setCard(d);
        return;
      }
      if (Number(d.current_balance) <= 0) {
        setError("Card has no remaining balance.");
        setCard(d);
        return;
      }
      setCard(d);
    } catch (err) {
      const msg = err?.response?.status === 404
        ? "Gift card not found."
        : (err?.response?.data?.detail || "Lookup failed.");
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!card) return;
    const balance = Number(card.current_balance) || 0;
    const due = Number(amountDue) || 0;
    const redeem = Math.min(balance, Math.max(0, due));
    if (redeem <= 0) {
      setError("Nothing to redeem.");
      return;
    }
    onAdded?.(card.serial, redeem, balance);
    reset();
  };

  const usable = card && card.status === "ACTIVE" && Number(card.current_balance) > 0;

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          size="small"
          label="Gift card serial"
          value={serial}
          onChange={(e) => { setSerial(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookup(); } }}
          sx={{ flex: 1 }}
        />
        <Button size="small" variant="outlined" disabled={!serial.trim() || busy} onClick={lookup}>
          Lookup
        </Button>
      </Stack>
      {error && (
        <Alert severity="warning" sx={{ mt: 1 }}>{error}</Alert>
      )}
      {card && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
          <Chip
            icon={<CardGiftcardIcon />}
            label={`${card.serial} · LKR ${Number(card.current_balance).toFixed(2)} · ${card.status}`}
            color={usable ? "success" : "default"}
          />
          {usable && (
            <Button size="small" variant="contained" onClick={apply}>
              Apply LKR {Math.min(Number(card.current_balance), Number(amountDue) || 0).toFixed(2)}
            </Button>
          )}
        </Stack>
      )}
      {!card && !error && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
          Look up a gift card by serial to redeem its balance.
        </Typography>
      )}
    </Box>
  );
}
