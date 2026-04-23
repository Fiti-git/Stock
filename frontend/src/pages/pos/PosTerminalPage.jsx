import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Box, Stack, TextField, Button, Typography, Chip, Divider, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, InputAdornment,
  Paper, Alert,
} from "@mui/material";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import PaymentsIcon from "@mui/icons-material/Payments";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import {
  getMyOpenShift, openShift, closeShift,
  searchProducts, productByBarcode, createBill,
  searchCustomers, getActivePromotions,
} from "../../api/pos";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import { useNotification } from "../../providers/NotificationProvider";

const TENDER_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "lankaqr", label: "LankaQR" },
  { value: "bank", label: "Bank" },
  { value: "other", label: "Other" },
];

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (n) => toNumber(n).toFixed(2);

export default function PosTerminalPage() {
  const { notify } = useNotification();
  const [shift, setShift] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(true);

  const [scanInput, setScanInput] = useState("");
  const scanRef = useRef(null);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  const [cart, setCart] = useState([]); // [{id, item_id, item_code, item_name, qty, unit_price, line_discount}]
  const [billDiscount, setBillDiscount] = useState("0");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promos, setPromos] = useState([]);
  const [appliedPromos, setAppliedPromos] = useState([]);   // [{id, name, kind, value, scope, ...}]
  const [tenderOpen, setTenderOpen] = useState(false);
  const [openShiftOpen, setOpenShiftOpen] = useState(false);
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [lastBill, setLastBill] = useState(null);

  // ------------- Shift lifecycle -------------
  const loadShift = useCallback(async () => {
    setShiftLoading(true);
    try {
      const res = await getMyOpenShift();
      setShift(res.data || null);
    } catch {
      setShift(null);
    } finally {
      setShiftLoading(false);
    }
  }, []);

  useEffect(() => { loadShift(); }, [loadShift]);

  // Autofocus barcode input when idle
  useEffect(() => {
    if (shift && !tenderOpen && !openShiftOpen && !closeShiftOpen && !lastBill) {
      scanRef.current?.focus();
    }
  }, [shift, tenderOpen, openShiftOpen, closeShiftOpen, lastBill]);

  // ------------- Cart totals -------------
  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, l) => s + toNumber(l.qty) * toNumber(l.unit_price) - toNumber(l.line_discount || 0), 0);
    let promoDiscount = 0;
    for (const p of appliedPromos) {
      if (p.scope === "bill") {
        if (toNumber(p.min_bill_amount) && subtotal < toNumber(p.min_bill_amount)) continue;
        promoDiscount += p.kind === "percent" ? subtotal * toNumber(p.value) / 100 : toNumber(p.value);
      } else if (p.scope === "item") {
        const line = cart.find((l) => l.item_id === p.item);
        if (!line) continue;
        const base = toNumber(line.qty) * toNumber(line.unit_price);
        promoDiscount += p.kind === "percent" ? base * toNumber(p.value) / 100 : toNumber(p.value);
      } else if (p.scope === "category") {
        // We don't carry category on cart lines currently; treat as bill-level best-effort (no-op here).
        const base = subtotal;
        if (toNumber(p.min_bill_amount) && base < toNumber(p.min_bill_amount)) continue;
        promoDiscount += p.kind === "percent" ? base * toNumber(p.value) / 100 : toNumber(p.value);
      }
    }
    const manualDiscount = toNumber(billDiscount) || 0;
    const totalDiscount = manualDiscount + promoDiscount;
    const grand = Math.max(0, subtotal - totalDiscount);
    const qtyTotal = cart.reduce((s, l) => s + toNumber(l.qty), 0);
    return { subtotal, discount: totalDiscount, manualDiscount, promoDiscount, grand, qtyTotal };
  }, [cart, billDiscount, appliedPromos]);

  // ------------- Product lookup -------------
  const handleScanSubmit = async (e) => {
    e.preventDefault();
    const code = scanInput.trim();
    if (!code) return;
    try {
      const res = await productByBarcode(code);
      addToCart(res.data);
      setScanInput("");
      setSearchResults([]);
    } catch {
      // Fall back to fuzzy search
      try {
        const r = await searchProducts(code);
        if ((r.data || []).length === 1) {
          addToCart(r.data[0]);
          setScanInput("");
          setSearchResults([]);
        } else {
          setSearchResults(r.data || []);
          if (!r.data?.length) notify("No product found.", "warning");
        }
      } catch {
        notify("Product lookup failed.", "error");
      }
    }
  };

  const handleSearchChange = async (val) => {
    setScanInput(val);
    if (val.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const r = await searchProducts(val);
      setSearchResults(r.data || []);
    } catch { /* ignore */ }
    finally { setSearching(false); }
  };

  const addToCart = (product) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.item_id === product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: toNumber(next[idx].qty) + 1 };
        return next;
      }
      return [
        ...prev,
        {
          key: Math.random().toString(36).slice(2),
          item_id: product.id,
          item_code: product.item_code,
          item_name: product.item_name,
          qty: 1,
          unit_price: toNumber(product.selling_price) || 0,
          line_discount: 0,
          tax_rate_pct: 0,
        },
      ];
    });
  };

  const updateLine = (key, patch) =>
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key) =>
    setCart((prev) => prev.filter((l) => l.key !== key));
  const clearCart = () => {
    setCart([]);
    setBillDiscount("0");
    setCustomerName("");
    setCustomerPhone("");
    setSelectedCustomer(null);
    setAppliedPromos([]);
  };

  const openPromoDialog = async () => {
    try {
      const r = await getActivePromotions(cart.map((l) => l.item_id));
      setPromos(r.data || []);
      setPromoOpen(true);
    } catch {
      notify("Failed to load promotions.", "error");
    }
  };
  const togglePromo = (p) => {
    setAppliedPromos((prev) => prev.some((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : [...prev, p]);
  };

  // ------------- Shift open/close -------------
  const handleOpenShift = async (openingCash) => {
    try {
      const res = await openShift(toNumber(openingCash));
      setShift(res.data);
      setOpenShiftOpen(false);
      notify("Shift opened.", "success");
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed to open shift.", "error");
    }
  };

  const handleCloseShift = async (counted, note) => {
    try {
      await closeShift(shift.id, toNumber(counted), note || "");
      setShift(null);
      setCloseShiftOpen(false);
      notify("Shift closed.", "success");
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed to close shift.", "error");
    }
  };

  // ------------- Finalise bill -------------
  const submitBill = async (payments) => {
    if (!cart.length) { notify("Cart is empty.", "warning"); return; }
    const effectiveBillDiscount = toNumber(billDiscount) + totals.promoDiscount;
    const payload = {
      lines: cart.map((l) => ({
        item_id: l.item_id, qty: String(l.qty),
        unit_price: String(l.unit_price),
        line_discount: String(l.line_discount || 0),
        tax_rate_pct: String(l.tax_rate_pct || 0),
      })),
      payments: payments.map((p) => ({
        tender: p.tender, amount: String(p.amount), reference: p.reference || "",
      })),
      bill_discount: String(effectiveBillDiscount.toFixed(2)),
      customer_name: customerName, customer_phone: customerPhone,
      promotion_ids: appliedPromos.map((p) => p.id),
    };
    try {
      const res = await createBill(payload);
      setLastBill(res.data);
      setTenderOpen(false);
      clearCart();
      notify(`Bill ${res.data.bill_no} created.`, "success");
    } catch (err) {
      notify(err?.response?.data?.detail || "Billing failed.", "error");
    }
  };

  // ------------- RENDER -------------
  if (shiftLoading) {
    return <Layout><Box sx={{ p: 4 }}>Loading…</Box></Layout>;
  }

  if (!shift) {
    return (
      <Layout>
        <PageHeader title="POS Terminal" subtitle="Open a shift to start billing" icon={<PointOfSaleIcon />} />
        <Paper sx={{ p: 4, mt: 2, maxWidth: 420 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>No open shift</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Open a shift to start taking bills. You'll be asked to declare opening cash and to count cash again on close.
          </Typography>
          <Button variant="contained" size="large" startIcon={<LockOpenIcon />} onClick={() => setOpenShiftOpen(true)}>
            Open shift
          </Button>
        </Paper>
        <OpenShiftDialog open={openShiftOpen} onClose={() => setOpenShiftOpen(false)} onConfirm={handleOpenShift} />
      </Layout>
    );
  }

  return (
    <Layout>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <PageHeader title="POS Terminal" subtitle={`Shift #${shift.id} · ${shift.outlet_name}`} icon={<PointOfSaleIcon />} />
        <Stack direction="row" spacing={1}>
          <Chip color="success" label={`${shift.bill_count || 0} bills`} />
          <Chip label={`Cash: LKR ${money(shift.cash_sales || 0)}`} />
          <Button variant="outlined" color="warning" startIcon={<LockIcon />} onClick={() => setCloseShiftOpen(true)}>
            Close shift
          </Button>
        </Stack>
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 420px" }, gap: 2 }}>
        {/* LEFT — scan + search + results */}
        <Box>
          <Paper sx={{ p: 2 }}>
            <form onSubmit={handleScanSubmit}>
              <TextField
                inputRef={scanRef}
                autoFocus
                fullWidth
                size="medium"
                label="Scan barcode or search item"
                value={scanInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Scan / type item code / name…"
                InputProps={{
                  startAdornment: <InputAdornment position="start"><QrCodeScannerIcon /></InputAdornment>,
                }}
              />
            </form>

            {searchResults.length > 0 && (
              <Box sx={{ mt: 2, maxHeight: 280, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1 }}>
                {searchResults.map((p) => (
                  <Stack
                    key={p.id} direction="row" spacing={2} alignItems="center"
                    sx={{ p: 1, borderBottom: 1, borderColor: "divider", "&:hover": { bgcolor: "action.hover" }, cursor: "pointer" }}
                    onClick={() => { addToCart(p); setScanInput(""); setSearchResults([]); scanRef.current?.focus(); }}
                  >
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={600}>{p.item_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{p.item_code} · {p.barcode || "no barcode"}</Typography>
                    </Box>
                    <Typography variant="body2" fontWeight={600}>LKR {money(p.selling_price)}</Typography>
                  </Stack>
                ))}
              </Box>
            )}
            {searching && <Typography variant="caption" color="text.secondary">Searching…</Typography>}
          </Paper>

          <Paper sx={{ mt: 2, p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Customer (optional)</Typography>
            <Stack direction="row" spacing={1}>
              <TextField size="small" label="Phone" value={customerPhone}
                onChange={async (e) => {
                  const v = e.target.value; setCustomerPhone(v);
                  if (v.length >= 3) {
                    try { const r = await searchCustomers(v); setCustomerSuggestions(r.data || []); } catch { /**/ }
                  } else setCustomerSuggestions([]);
                }}
                sx={{ flex: 1 }} />
              <TextField size="small" label="Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} sx={{ flex: 1 }} />
            </Stack>
            {customerSuggestions.length > 0 && (
              <Box sx={{ mt: 1, border: 1, borderColor: "divider", borderRadius: 1, maxHeight: 180, overflow: "auto" }}>
                {customerSuggestions.map((c) => (
                  <Box key={c.id}
                    onClick={() => { setCustomerName(c.name); setCustomerPhone(c.phone); setSelectedCustomer(c); setCustomerSuggestions([]); }}
                    sx={{ p: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" }, borderBottom: 1, borderColor: "divider" }}>
                    <Typography variant="body2" fontWeight={600}>{c.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{c.phone} · {c.loyalty_points} pts · Credit LKR {Number(c.credit_balance || 0).toFixed(2)}</Typography>
                  </Box>
                ))}
              </Box>
            )}
            {selectedCustomer && (
              <Box sx={{ mt: 1, p: 1, bgcolor: "success.light", borderRadius: 1 }}>
                <Typography variant="caption">
                  <b>{selectedCustomer.name}</b> · {selectedCustomer.loyalty_points} pts · <b>Credit LKR {Number(selectedCustomer.credit_balance || 0).toFixed(2)}</b>
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>

        {/* RIGHT — cart */}
        <Paper sx={{ p: 2, display: "flex", flexDirection: "column", minHeight: 560 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Cart</Typography>
          <Box sx={{ flex: 1, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1 }}>
            {cart.length === 0 ? (
              <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>Cart is empty</Box>
            ) : (
              cart.map((l) => (
                <Stack key={l.key} direction="row" spacing={1} alignItems="center" sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>{l.item_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{l.item_code} · LKR {money(l.unit_price)}</Typography>
                  </Box>
                  <IconButton size="small" onClick={() => updateLine(l.key, { qty: Math.max(0, toNumber(l.qty) - 1) })}><RemoveIcon fontSize="small" /></IconButton>
                  <TextField size="small" value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} sx={{ width: 70 }} inputProps={{ inputMode: "decimal" }} />
                  <IconButton size="small" onClick={() => updateLine(l.key, { qty: toNumber(l.qty) + 1 })}><AddIcon fontSize="small" /></IconButton>
                  <Typography variant="body2" fontWeight={600} sx={{ minWidth: 80, textAlign: "right" }}>
                    {money(toNumber(l.qty) * toNumber(l.unit_price) - toNumber(l.line_discount))}
                  </Typography>
                  <IconButton size="small" color="error" onClick={() => removeLine(l.key)}><DeleteIcon fontSize="small" /></IconButton>
                </Stack>
              ))
            )}
          </Box>

          <Divider sx={{ my: 1 }} />
          <Stack spacing={0.5}>
            <Row label="Items" value={cart.length} />
            <Row label="Qty" value={money(totals.qtyTotal)} />
            <Row label="Subtotal" value={`LKR ${money(totals.subtotal)}`} />
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography sx={{ flex: 1 }} variant="body2">Manual discount</Typography>
              <TextField size="small" value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} sx={{ width: 120 }} inputProps={{ inputMode: "decimal" }} />
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography sx={{ flex: 1 }} variant="body2">Promo discount</Typography>
              <Button size="small" startIcon={<LocalOfferIcon />} onClick={openPromoDialog}>
                {appliedPromos.length ? `${appliedPromos.length} applied` : "Apply"}
              </Button>
              <Typography variant="body2" fontWeight={600}>-{money(totals.promoDiscount)}</Typography>
            </Stack>
            <Divider />
            <Stack direction="row" spacing={1}>
              <Typography sx={{ flex: 1 }} variant="h6">Total</Typography>
              <Typography variant="h6" fontWeight={700}>LKR {money(totals.grand)}</Typography>
            </Stack>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button variant="outlined" onClick={clearCart} disabled={!cart.length}>Clear</Button>
            <Button variant="contained" color="primary" size="large" fullWidth
              startIcon={<PaymentsIcon />}
              disabled={!cart.length || totals.grand <= 0}
              onClick={() => setTenderOpen(true)}>
              Pay LKR {money(totals.grand)}
            </Button>
          </Stack>
        </Paper>
      </Box>

      {/* Dialogs */}
      <OpenShiftDialog open={openShiftOpen} onClose={() => setOpenShiftOpen(false)} onConfirm={handleOpenShift} />
      <CloseShiftDialog open={closeShiftOpen} shift={shift} onClose={() => setCloseShiftOpen(false)} onConfirm={handleCloseShift} />
      <TenderDialog
        open={tenderOpen}
        grandTotal={totals.grand}
        shift={shift}
        customer={selectedCustomer}
        onClose={() => setTenderOpen(false)}
        onConfirm={submitBill}
      />
      <ReceiptDialog bill={lastBill} onClose={() => setLastBill(null)} />

      <Dialog open={promoOpen} onClose={() => setPromoOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Apply promotions</DialogTitle>
        <DialogContent>
          {promos.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No active promotions.</Typography>
          ) : (
            <Stack spacing={1} sx={{ mt: 1 }}>
              {promos.map((p) => {
                const picked = appliedPromos.some((x) => x.id === p.id);
                return (
                  <Stack key={p.id} direction="row" alignItems="center"
                    sx={{ p: 1.5, border: 1, borderColor: picked ? "success.main" : "divider", borderRadius: 1, cursor: "pointer", bgcolor: picked ? "success.light" : "transparent" }}
                    onClick={() => togglePromo(p)}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={600}>{p.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {p.scope} · {p.kind === "percent" ? `${p.value}% off` : `LKR ${p.value} off`}
                        {p.min_bill_amount > 0 && ` · min LKR ${p.min_bill_amount}`}
                      </Typography>
                    </Box>
                    <Chip size="small" label={picked ? "Applied" : "Apply"} color={picked ? "success" : "default"} />
                  </Stack>
                );
              })}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPromoOpen(false)}>Done</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}

function Row({ label, value }) {
  return (
    <Stack direction="row">
      <Typography sx={{ flex: 1 }} variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={600}>{value}</Typography>
    </Stack>
  );
}

// --- Dialogs ---

function OpenShiftDialog({ open, onClose, onConfirm }) {
  const [cash, setCash] = useState("0");
  useEffect(() => { if (open) setCash("0"); }, [open]);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Open shift</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth label="Opening cash (LKR)" value={cash}
          onChange={(e) => setCash(e.target.value)} sx={{ mt: 1 }} inputProps={{ inputMode: "decimal" }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => onConfirm(cash)}>Open</Button>
      </DialogActions>
    </Dialog>
  );
}

function CloseShiftDialog({ open, shift, onClose, onConfirm }) {
  const [counted, setCounted] = useState("0");
  const [note, setNote] = useState("");
  useEffect(() => { if (open) { setCounted("0"); setNote(""); } }, [open]);
  if (!shift) return null;
  const expected = toNumber(shift.expected_cash);
  const variance = toNumber(counted) - expected;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Close shift</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="info">
            Opening cash: LKR {money(shift.opening_cash)}<br />
            Cash sales: LKR {money(shift.cash_sales)}<br />
            <b>Expected in drawer: LKR {money(expected)}</b>
          </Alert>
          <TextField autoFocus fullWidth label="Counted cash (LKR)" value={counted}
            onChange={(e) => setCounted(e.target.value)} inputProps={{ inputMode: "decimal" }} />
          <Alert severity={variance === 0 ? "success" : (Math.abs(variance) < 100 ? "warning" : "error")}>
            Variance: LKR {money(variance)}
          </Alert>
          <TextField fullWidth multiline minRows={2} label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="warning" onClick={() => onConfirm(counted, note)}>Close shift</Button>
      </DialogActions>
    </Dialog>
  );
}

function TenderDialog({ open, grandTotal, shift, customer, onClose, onConfirm }) {
  const [rows, setRows] = useState([{ tender: "cash", amount: "", reference: "" }]);
  const [qrUrl, setQrUrl] = useState(null);
  useEffect(() => {
    if (open) setRows([{ tender: "cash", amount: String(grandTotal.toFixed(2)), reference: "" }]);
  }, [open, grandTotal]);
  useEffect(() => {
    // If outlet has a static LankaQR image and any row uses lankaqr, fetch settings once
    if (!open || !shift) return;
    const needsQr = rows.some((r) => r.tender === "lankaqr");
    if (needsQr && qrUrl === null) {
      import("../../api/pos").then(({ getOutletSettings }) =>
        getOutletSettings(shift.outlet).then((r) => setQrUrl(r.data.lankaqr_static_qr_url || "")).catch(() => setQrUrl(""))
      );
    }
  }, [open, shift, rows, qrUrl]);

  const paid = rows.reduce((s, r) => s + toNumber(r.amount), 0);
  const change = paid - grandTotal;
  const anyLankaQr = rows.some((r) => r.tender === "lankaqr");
  const creditRequested = rows
    .filter((r) => r.tender === "credit")
    .reduce((s, r) => s + toNumber(r.amount), 0);
  const creditBalance = toNumber(customer?.credit_balance);
  const creditShort = creditRequested > 0 && (!customer || creditRequested > creditBalance);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Payment — LKR {money(grandTotal)}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {rows.map((r, i) => (
            <Stack key={i} direction="row" spacing={1}>
              <TextField select size="small" label="Tender" value={r.tender}
                onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, tender: e.target.value } : x))}
                sx={{ minWidth: 140 }}>
                {TENDER_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Amount" value={r.amount} sx={{ flex: 1 }}
                inputProps={{ inputMode: "decimal" }}
                onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
              />
              <TextField size="small" label="Ref" value={r.reference} sx={{ flex: 1 }}
                onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, reference: e.target.value } : x))}
              />
              <IconButton size="small" color="error" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Button startIcon={<AddIcon />} size="small" onClick={() => setRows([...rows, { tender: "cash", amount: "", reference: "" }])}>
            Add split tender
          </Button>
          <Divider />
          <Row label="Paid" value={`LKR ${money(paid)}`} />
          <Row label="Change due" value={`LKR ${money(Math.max(0, change))}`} />
          {paid < grandTotal && <Alert severity="warning">Short by LKR {money(grandTotal - paid)}</Alert>}
          {creditRequested > 0 && !customer && (
            <Alert severity="error">Select a customer (by phone) to use store credit.</Alert>
          )}
          {creditRequested > 0 && customer && (
            <Alert severity={creditShort ? "error" : "info"}>
              Customer credit: LKR {money(creditBalance)} · using LKR {money(creditRequested)}
              {creditShort && " — insufficient balance"}
            </Alert>
          )}
          {anyLankaQr && qrUrl && (
            <Box sx={{ textAlign: "center", p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
              <Typography variant="caption" display="block" gutterBottom>Ask customer to scan:</Typography>
              <img src={qrUrl} alt="LankaQR" style={{ maxWidth: 220, maxHeight: 220 }} />
            </Box>
          )}
          {anyLankaQr && qrUrl === "" && (
            <Alert severity="info">Upload a LankaQR image in Outlet Settings to show it here.</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="success" disabled={paid < grandTotal || creditShort}
          onClick={() => onConfirm(rows.filter((r) => toNumber(r.amount) > 0))}>
          Finalize &amp; Print
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ReceiptDialog({ bill, onClose }) {
  if (!bill) return null;
  const printRef = useRef(null);
  const doPrint = () => {
    const html = printRef.current?.innerHTML || "";
    const w = window.open("", "_blank", "width=360,height=600");
    if (!w) return;
    w.document.write(`<html><head><title>${bill.bill_no}</title>
      <style>
        body{font-family:monospace;font-size:12px;margin:0;padding:8px;width:280px}
        .center{text-align:center} .right{text-align:right}
        table{width:100%;border-collapse:collapse} td{padding:2px 0}
        .sep{border-top:1px dashed #000;margin:4px 0}
      </style></head><body>${html}<script>window.print();window.close();<\/script></body></html>`);
    w.document.close();
  };
  return (
    <Dialog open={!!bill} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Receipt — {bill.bill_no}</DialogTitle>
      <DialogContent>
        <Box ref={printRef} sx={{ fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-line" }}>
          <div className="center"><b>{bill.outlet_name}</b></div>
          {bill.outlet_address && <div className="center">{bill.outlet_address}</div>}
          {bill.outlet_phone && <div className="center">Tel: {bill.outlet_phone}</div>}
          {bill.outlet_tax_reg && <div className="center">Tax Reg: {bill.outlet_tax_reg}</div>}
          <div className="center">Bill: {bill.bill_no}</div>
          <div className="center">{new Date(bill.closed_at || bill.created_at).toLocaleString()}</div>
          <div className="center">Cashier: {bill.cashier_username}</div>
          {bill.customer_name && <div className="center">Customer: {bill.customer_name} {bill.customer_phone && `(${bill.customer_phone})`}</div>}
          <div className="sep" />
          <table>
            <tbody>
              {bill.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.item_name}<br/><small>{l.qty} × {money(l.unit_price)}</small></td>
                  <td className="right">{money(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="sep" />
          <table>
            <tbody>
              <tr><td>Subtotal</td><td className="right">{money(bill.subtotal)}</td></tr>
              {toNumber(bill.bill_discount) > 0 && <tr><td>Discount</td><td className="right">-{money(bill.bill_discount)}</td></tr>}
              {toNumber(bill.tax_total) > 0 && <tr><td>Tax</td><td className="right">{money(bill.tax_total)}</td></tr>}
              <tr><td><b>Grand total</b></td><td className="right"><b>{money(bill.grand_total)}</b></td></tr>
              {bill.payments.map((p) => (
                <tr key={p.id}><td>{p.tender.toUpperCase()}</td><td className="right">{money(p.amount)}</td></tr>
              ))}
              {toNumber(bill.change_due) > 0 && <tr><td>Change</td><td className="right">{money(bill.change_due)}</td></tr>}
            </tbody>
          </table>
          <div className="sep" />
          <div className="center">Thank you!</div>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={doPrint}>Print</Button>
      </DialogActions>
    </Dialog>
  );
}
