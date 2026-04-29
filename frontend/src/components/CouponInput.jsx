import { useState } from "react";
import { Stack, TextField, Button, Chip, Typography, Box } from "@mui/material";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import { redeemCouponCheck } from "../api/pos";

/**
 * CouponInput — apply a single coupon code against the current cart.
 *
 * Props:
 *   subtotal   number — current bill subtotal (pre-discount)
 *   customerId number|null — optional, used by per-customer-limit checks
 *   onApplied  (coupon, discount) => void — coupon: {code}, discount: number
 *   onRemoved  () => void
 */
export default function CouponInput({ subtotal, customerId, onApplied, onRemoved }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(null); // { code, discount }

  const apply = async () => {
    const c = code.trim();
    if (!c) return;
    setBusy(true);
    setError("");
    try {
      const res = await redeemCouponCheck({
        code: c,
        customer_id: customerId || undefined,
        bill_subtotal: subtotal,
      });
      const data = res.data || {};
      if (data.valid) {
        const discount = Number(data.discount) || 0;
        const couponObj = { code: c };
        setApplied({ code: c, discount });
        setCode("");
        onApplied?.(couponObj, discount);
      } else {
        setError(data.message || "Invalid coupon.");
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.response?.data?.detail || "Coupon check failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    setApplied(null);
    setError("");
    onRemoved?.();
  };

  if (applied) {
    return (
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip
          icon={<LocalOfferIcon />}
          label={`${applied.code} · -LKR ${Number(applied.discount).toFixed(2)}`}
          color="success"
          onDelete={remove}
        />
      </Stack>
    );
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField
          size="small"
          label="Coupon"
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } }}
          sx={{ flex: 1 }}
        />
        <Button size="small" variant="outlined" disabled={!code.trim() || busy} onClick={apply}>
          Apply
        </Button>
      </Stack>
      {error && (
        <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block" }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
