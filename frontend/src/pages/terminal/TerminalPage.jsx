import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Box, Stack, TextField, Button, Typography, Chip, Divider, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, Tooltip,
  Paper, Alert, InputAdornment,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import PaymentsIcon from "@mui/icons-material/Payments";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import ReceiptIconMui from "@mui/icons-material/Receipt";
import api from "../../api/client";
import {
  getMyOpenShift, openShift, closeShift,
  searchProducts, productByBarcode, createBill,
  searchCustomers, getActivePromotions, quickProducts,
} from "../../api/pos";
import TerminalShell from "./TerminalShell";
import ErrorBoundary from "../../components/ErrorBoundary";
import IdleLock from "../../components/IdleLock";
import { useNotification } from "../../providers/NotificationProvider";

const TENDER_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "lankaqr", label: "LankaQR" },
  { value: "bank", label: "Bank" },
  { value: "credit", label: "Credit" },
  { value: "other", label: "Other" },
];

const toNumber = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = (n) => toNumber(n).toFixed(2);

// ---- Auto-print helper ----
function autoPrintReceipt(bill) {
  if (!bill) return;
  const tenders = bill.payments.map((p) => `<tr><td>${p.tender.toUpperCase()}</td><td class="right">${money(p.amount)}</td></tr>`).join("");
  const lines = bill.lines.map((l) => `<tr><td>${l.item_name}<br/><small>${l.qty} × ${money(l.unit_price)}</small></td><td class="right">${money(l.line_total)}</td></tr>`).join("");
  const w = window.open("", "_blank", "width=360,height=700");
  if (!w) return;
  w.document.write(`<html><head><title>${bill.bill_no}</title>
    <style>body{font-family:monospace;font-size:12px;padding:8px;width:280px}
      .center{text-align:center}.right{text-align:right}
      table{width:100%;border-collapse:collapse}td{padding:2px 0}
      .sep{border-top:1px dashed #000;margin:4px 0}
    </style></head><body>
    <div class="center"><b>${bill.outlet_name}</b></div>
    ${bill.outlet_address ? `<div class="center">${bill.outlet_address}</div>` : ""}
    ${bill.outlet_phone ? `<div class="center">Tel: ${bill.outlet_phone}</div>` : ""}
    ${bill.outlet_tax_reg ? `<div class="center">Tax Reg: ${bill.outlet_tax_reg}</div>` : ""}
    <div class="center">Bill: ${bill.bill_no}</div>
    <div class="center">${new Date(bill.closed_at || bill.created_at).toLocaleString()}</div>
    <div class="center">Cashier: ${bill.cashier_username}</div>
    ${bill.customer_name ? `<div class="center">Customer: ${bill.customer_name} ${bill.customer_phone || ""}</div>` : ""}
    <div class="sep"></div>
    <table>${lines}</table>
    <div class="sep"></div>
    <table>
      <tr><td>Subtotal</td><td class="right">${money(bill.subtotal)}</td></tr>
      ${toNumber(bill.bill_discount) > 0 ? `<tr><td>Discount</td><td class="right">-${money(bill.bill_discount)}</td></tr>` : ""}
      ${toNumber(bill.tax_total) > 0 ? `<tr><td>Tax</td><td class="right">${money(bill.tax_total)}</td></tr>` : ""}
      <tr><td><b>Total</b></td><td class="right"><b>${money(bill.grand_total)}</b></td></tr>
      ${tenders}
      ${toNumber(bill.change_due) > 0 ? `<tr><td>Change</td><td class="right">${money(bill.change_due)}</td></tr>` : ""}
    </table>
    <div class="sep"></div>
    <div class="center">${bill.outlet_receipt_footer || "Thank you!"}</div>
    <script>window.focus();window.print();setTimeout(function(){window.close()},500);</script>
  </body></html>`);
  w.document.close();
}

function TerminalInner() {
  const { notify } = useNotification();
  const [shift, setShift] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(true);

  const [scanInput, setScanInput] = useState("");
  const scanRef = useRef(null);
  const [searchResults, setSearchResults] = useState([]);

  const [cart, setCart] = useState([]);
  const [billDiscount, setBillDiscount] = useState("0");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSuggestions, setCustomerSuggestions] = useState([]);

  const [appliedPromos, setAppliedPromos] = useState([]);
  const [promos, setPromos] = useState([]);
  const [promoOpen, setPromoOpen] = useState(false);

  const [tenderOpen, setTenderOpen] = useState(false);
  const [openShiftOpen, setOpenShiftOpen] = useState(false);
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);

  const [parked, setParked] = useState([]);
  const [parkedOpen, setParkedOpen] = useState(false);
  const [quick, setQuick] = useState([]);

  // ---- Shift lifecycle ----
  const loadShift = useCallback(async () => {
    setShiftLoading(true);
    try { const res = await getMyOpenShift(); setShift(res.data || null); }
    catch { setShift(null); }
    finally { setShiftLoading(false); }
  }, []);
  useEffect(() => { loadShift(); }, [loadShift]);

  const loadParked = useCallback(async () => {
    try { const r = await api.get("/pos/bills/parked/"); setParked(r.data.results || []); } catch { /**/ }
  }, []);
  useEffect(() => { if (shift) loadParked(); }, [shift, loadParked]);

  useEffect(() => {
    if (!shift) return;
    (async () => { try { const r = await quickProducts(12); setQuick(r.data || []); } catch { /**/ } })();
  }, [shift]);

  // Always keep focus on scan input when ready
  const refocus = useCallback(() => {
    if (!tenderOpen && !openShiftOpen && !closeShiftOpen && !promoOpen && !parkedOpen) {
      setTimeout(() => scanRef.current?.focus(), 50);
    }
  }, [tenderOpen, openShiftOpen, closeShiftOpen, promoOpen, parkedOpen]);

  useEffect(() => { if (shift) refocus(); }, [shift, cart.length, refocus]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) {
        // Only trap F-keys inside inputs
        if (!e.key.startsWith("F")) return;
      }
      if (e.key === "F8" && cart.length > 0) { e.preventDefault(); setTenderOpen(true); }
      else if (e.key === "F9" && cart.length > 0) { e.preventDefault(); doPark(); }
      else if (e.key === "Escape") {
        if (tenderOpen) setTenderOpen(false);
        else if (promoOpen) setPromoOpen(false);
        else if (parkedOpen) setParkedOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line
  }, [cart.length, tenderOpen, promoOpen, parkedOpen]);

  // ---- Cart totals ----
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
      }
    }
    const manualDiscount = toNumber(billDiscount) || 0;
    const grand = Math.max(0, subtotal - manualDiscount - promoDiscount);
    return { subtotal, manualDiscount, promoDiscount, grand };
  }, [cart, billDiscount, appliedPromos]);

  // ---- Scan / search ----
  const handleScanSubmit = async (e) => {
    e.preventDefault();
    const code = scanInput.trim();
    if (!code) return;
    try {
      const r = await productByBarcode(code);
      addToCart(r.data); setScanInput(""); setSearchResults([]);
    } catch {
      try {
        const r = await searchProducts(code);
        if ((r.data || []).length === 1) { addToCart(r.data[0]); setScanInput(""); setSearchResults([]); }
        else {
          setSearchResults(r.data || []);
          if (!r.data?.length) notify("No product found.", "warning");
        }
      } catch { notify("Product lookup failed.", "error"); }
    }
    refocus();
  };
  const handleSearchChange = async (v) => {
    setScanInput(v);
    if (v.length < 2) { setSearchResults([]); return; }
    try { const r = await searchProducts(v); setSearchResults(r.data || []); } catch { /**/ }
  };

  const addToCart = (p) => {
    setCart((prev) => {
      const i = prev.findIndex((l) => l.item_id === p.id);
      if (i >= 0) { const n = [...prev]; n[i] = { ...n[i], qty: toNumber(n[i].qty) + 1 }; return n; }
      return [...prev, {
        key: Math.random().toString(36).slice(2),
        item_id: p.id, item_code: p.item_code, item_name: p.item_name,
        qty: 1, unit_price: toNumber(p.selling_price) || 0,
        line_discount: 0, tax_rate_pct: toNumber(p.tax_rate_pct) || 0,
      }];
    });
  };
  const updateLine = (k, patch) => setCart((prev) => prev.map((l) => l.key === k ? { ...l, ...patch } : l));
  const removeLine = (k) => setCart((prev) => prev.filter((l) => l.key !== k));
  const clearCart = () => {
    setCart([]); setBillDiscount("0"); setCustomerName(""); setCustomerPhone("");
    setSelectedCustomer(null); setAppliedPromos([]);
  };

  // ---- Park / reopen ----
  const doPark = async () => {
    if (!cart.length) return;
    try {
      await api.post("/pos/bills/park/", {
        lines: cart.map((l) => ({
          item_id: l.item_id, qty: String(l.qty),
          unit_price: String(l.unit_price), line_discount: String(l.line_discount || 0),
          tax_rate_pct: String(l.tax_rate_pct || 0),
        })),
        customer_name: customerName, customer_phone: customerPhone,
      });
      notify("Cart parked.", "success");
      clearCart();
      loadParked();
    } catch (err) { notify(err?.response?.data?.detail || "Park failed.", "error"); }
  };

  const reopenParked = (draft) => {
    setCart(draft.lines.map((l) => ({
      key: Math.random().toString(36).slice(2),
      item_id: l.item, item_code: l.item_code, item_name: l.item_name,
      qty: toNumber(l.qty), unit_price: toNumber(l.unit_price),
      line_discount: toNumber(l.line_discount), tax_rate_pct: toNumber(l.tax_rate_pct),
    })));
    if (draft.customer_name) setCustomerName(draft.customer_name);
    if (draft.customer_phone) setCustomerPhone(draft.customer_phone);
    setParkedOpen(false);
    // Discard the draft so it doesn't pile up
    api.delete(`/pos/bills/${draft.id}/discard/`).then(() => loadParked());
  };

  // ---- Shift open/close ----
  const handleOpenShift = async (cash) => {
    try { const r = await openShift(toNumber(cash)); setShift(r.data); setOpenShiftOpen(false); notify("Shift opened.", "success"); }
    catch (err) { notify(err?.response?.data?.detail || "Failed.", "error"); }
  };
  const handleCloseShift = async (counted, note) => {
    try { await closeShift(shift.id, toNumber(counted), note || ""); setShift(null); setCloseShiftOpen(false); notify("Shift closed.", "success"); }
    catch (err) { notify(err?.response?.data?.detail || "Failed.", "error"); }
  };

  // ---- Promos ----
  const openPromoDialog = async () => {
    try { const r = await getActivePromotions(cart.map((l) => l.item_id)); setPromos(r.data || []); setPromoOpen(true); }
    catch { notify("Failed.", "error"); }
  };

  // ---- Submit bill ----
  const submitBill = async (payments) => {
    if (!cart.length) return;
    const effectiveDiscount = toNumber(billDiscount) + totals.promoDiscount;
    try {
      const r = await createBill({
        lines: cart.map((l) => ({
          item_id: l.item_id, qty: String(l.qty),
          unit_price: String(l.unit_price), line_discount: String(l.line_discount || 0),
          tax_rate_pct: String(l.tax_rate_pct || 0),
        })),
        payments: payments.map((p) => ({ tender: p.tender, amount: String(p.amount), reference: p.reference || "" })),
        bill_discount: String(effectiveDiscount.toFixed(2)),
        customer_name: customerName, customer_phone: customerPhone,
        promotion_ids: appliedPromos.map((p) => p.id),
      });
      setTenderOpen(false);
      clearCart();
      notify(`Bill ${r.data.bill_no} — LKR ${money(r.data.grand_total)}`, "success");
      autoPrintReceipt(r.data);   // ← industry-style auto-print
      loadShift();                // refresh shift totals
      refocus();
    } catch (err) { notify(err?.response?.data?.detail || "Billing failed.", "error"); }
  };

  if (shiftLoading) {
    return <TerminalShell><Box sx={{ p: 4 }}>Loading…</Box></TerminalShell>;
  }

  if (!shift) {
    return (
      <TerminalShell>
        <Paper sx={{ p: 4, maxWidth: 420, mx: "auto", mt: 4 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>No open shift</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Open a shift to start billing.
          </Typography>
          <Button variant="contained" size="large" fullWidth startIcon={<LockOpenIcon />} onClick={() => setOpenShiftOpen(true)}>
            Open shift
          </Button>
        </Paper>
        <OpenShiftDialog open={openShiftOpen} onClose={() => setOpenShiftOpen(false)} onConfirm={handleOpenShift} />
      </TerminalShell>
    );
  }

  return (
    <TerminalShell shift={shift}>
      <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mb: 1 }}>
        <Chip icon={<ReceiptIconMui />} label={`${shift.bill_count || 0} bills`} color="success" size="small" />
        <Chip label={`Cash LKR ${money(shift.cash_sales || 0)}`} size="small" />
        <Button size="small" variant="outlined" startIcon={<PauseCircleIcon />} onClick={() => setParkedOpen(true)}>
          Parked ({parked.length})
        </Button>
        <Button size="small" variant="outlined" color="warning" startIcon={<LockIcon />} onClick={() => setCloseShiftOpen(true)}>
          Close shift
        </Button>
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 460px" }, gap: 2 }}>
        <Box>
          <Paper sx={{ p: 2 }}>
            <form onSubmit={handleScanSubmit}>
              <TextField inputRef={scanRef} autoFocus fullWidth size="medium"
                label="Scan barcode or search (F8 = Pay · F9 = Park)"
                value={scanInput} onChange={(e) => handleSearchChange(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><QrCodeScannerIcon /></InputAdornment> }} />
            </form>
            {quick.length > 0 && searchResults.length === 0 && scanInput === "" && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>Quick add — top sellers</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 1 }}>
                  {quick.map((p) => (
                    <Paper key={p.id} variant="outlined" onClick={() => { addToCart(p); refocus(); }}
                      sx={{ p: 1.2, cursor: "pointer", textAlign: "center", minHeight: 78,
                            "&:hover": { bgcolor: "action.hover", borderColor: "primary.main" } }}>
                      <Typography variant="caption" fontWeight={700} noWrap sx={{ display: "block" }}>{p.item_name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>{p.item_code}</Typography>
                      <Typography variant="body2" fontWeight={700} color="primary.main">{money(p.selling_price)}</Typography>
                    </Paper>
                  ))}
                </Box>
              </Box>
            )}
            {searchResults.length > 0 && (
              <Box sx={{ mt: 2, maxHeight: 280, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1 }}>
                {searchResults.map((p) => (
                  <Stack key={p.id} direction="row" spacing={2} alignItems="center"
                    sx={{ p: 1, borderBottom: 1, borderColor: "divider", "&:hover": { bgcolor: "action.hover" }, cursor: "pointer" }}
                    onClick={() => { addToCart(p); setScanInput(""); setSearchResults([]); refocus(); }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight={600}>{p.item_name}</Typography>
                      <Typography variant="caption" color="text.secondary">{p.item_code} · {p.barcode || "no barcode"} · on hand: {p.on_hand}</Typography>
                    </Box>
                    <Typography variant="body2" fontWeight={600}>LKR {money(p.selling_price)}</Typography>
                  </Stack>
                ))}
              </Box>
            )}
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
                }} sx={{ flex: 1 }} />
              <TextField size="small" label="Name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} sx={{ flex: 1 }} />
            </Stack>
            {customerSuggestions.length > 0 && (
              <Box sx={{ mt: 1, border: 1, borderColor: "divider", borderRadius: 1, maxHeight: 150, overflow: "auto" }}>
                {customerSuggestions.map((c) => (
                  <Box key={c.id} onClick={() => { setCustomerName(c.name); setCustomerPhone(c.phone); setSelectedCustomer(c); setCustomerSuggestions([]); }}
                    sx={{ p: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}>
                    <Typography variant="body2" fontWeight={600}>{c.name}</Typography>
                    <Typography variant="caption">{c.phone} · {c.loyalty_points} pts · Credit {money(c.credit_balance)}</Typography>
                  </Box>
                ))}
              </Box>
            )}
            {selectedCustomer && (
              <Alert severity="success" sx={{ mt: 1, py: 0 }}>
                {selectedCustomer.name} · {selectedCustomer.loyalty_points} pts · Credit LKR {money(selectedCustomer.credit_balance)}
              </Alert>
            )}
          </Paper>
        </Box>

        <Paper sx={{ p: 2, display: "flex", flexDirection: "column", minHeight: "calc(100vh - 180px)" }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Cart ({cart.length})</Typography>
          <Box sx={{ flex: 1, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1 }}>
            {cart.length === 0 ? (
              <Box sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>Scan a product to begin</Box>
            ) : cart.map((l) => (
              <Stack key={l.key} direction="row" spacing={1} alignItems="center" sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>{l.item_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{l.item_code} · LKR {money(l.unit_price)}</Typography>
                </Box>
                <IconButton size="small" onClick={() => updateLine(l.key, { qty: Math.max(0, toNumber(l.qty) - 1) })}><RemoveIcon fontSize="small" /></IconButton>
                <TextField size="small" value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} sx={{ width: 65 }} inputProps={{ inputMode: "decimal", style: { textAlign: "center" } }} />
                <IconButton size="small" onClick={() => updateLine(l.key, { qty: toNumber(l.qty) + 1 })}><AddIcon fontSize="small" /></IconButton>
                <Typography variant="body2" fontWeight={600} sx={{ minWidth: 75, textAlign: "right" }}>
                  {money(toNumber(l.qty) * toNumber(l.unit_price) - toNumber(l.line_discount))}
                </Typography>
                <IconButton size="small" color="error" onClick={() => removeLine(l.key)}><DeleteIcon fontSize="small" /></IconButton>
              </Stack>
            ))}
          </Box>

          <Divider sx={{ my: 1 }} />
          <Stack spacing={0.5}>
            <Row l="Subtotal" v={`LKR ${money(totals.subtotal)}`} />
            <Stack direction="row" alignItems="center">
              <Typography sx={{ flex: 1 }} variant="body2">Manual discount</Typography>
              <TextField size="small" value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} sx={{ width: 110 }} inputProps={{ inputMode: "decimal" }} />
            </Stack>
            <Stack direction="row" alignItems="center">
              <Typography sx={{ flex: 1 }} variant="body2">Promo discount</Typography>
              <Button size="small" startIcon={<LocalOfferIcon />} onClick={openPromoDialog}>
                {appliedPromos.length ? `${appliedPromos.length}` : "Apply"}
              </Button>
              <Typography variant="body2" fontWeight={600} sx={{ ml: 1 }}>-{money(totals.promoDiscount)}</Typography>
            </Stack>
            <Divider />
            <Stack direction="row">
              <Typography sx={{ flex: 1 }} variant="h5">Total</Typography>
              <Typography variant="h5" fontWeight={700} color="primary">LKR {money(totals.grand)}</Typography>
            </Stack>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button variant="outlined" color="warning" onClick={doPark} disabled={!cart.length} startIcon={<PauseCircleIcon />}>Park</Button>
            <Button variant="outlined" onClick={clearCart} disabled={!cart.length}>Clear</Button>
            <Button variant="contained" color="primary" size="large" fullWidth sx={{ height: 56 }}
              startIcon={<PaymentsIcon />}
              disabled={!cart.length || totals.grand <= 0}
              onClick={() => setTenderOpen(true)}>
              Pay LKR {money(totals.grand)}
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, textAlign: "center" }}>
            F8 = Pay · F9 = Park · Esc = Close dialog
          </Typography>
        </Paper>
      </Box>

      <OpenShiftDialog open={openShiftOpen} onClose={() => setOpenShiftOpen(false)} onConfirm={handleOpenShift} />
      <CloseShiftDialog open={closeShiftOpen} shift={shift} onClose={() => setCloseShiftOpen(false)} onConfirm={handleCloseShift} />
      <TenderDialog open={tenderOpen} grandTotal={totals.grand} customer={selectedCustomer} shift={shift}
        onClose={() => setTenderOpen(false)} onConfirm={submitBill} />

      <Dialog open={promoOpen} onClose={() => setPromoOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Apply promotions</DialogTitle>
        <DialogContent>
          {promos.length === 0 ? <Typography variant="body2" color="text.secondary">No active promotions.</Typography> :
            <Stack spacing={1} sx={{ mt: 1 }}>
              {promos.map((p) => {
                const picked = appliedPromos.some((x) => x.id === p.id);
                return (
                  <Stack key={p.id} direction="row" alignItems="center"
                    sx={{ p: 1.5, border: 1, borderColor: picked ? "success.main" : "divider", borderRadius: 1, cursor: "pointer", bgcolor: picked ? "success.light" : "transparent" }}
                    onClick={() => setAppliedPromos((prev) => picked ? prev.filter((x) => x.id !== p.id) : [...prev, p])}>
                    <Box sx={{ flex: 1 }}>
                      <Typography fontWeight={600}>{p.name}</Typography>
                      <Typography variant="caption">{p.scope} · {p.kind === "percent" ? `${p.value}%` : `LKR ${p.value}`}</Typography>
                    </Box>
                    <Chip size="small" label={picked ? "Applied" : "Apply"} color={picked ? "success" : "default"} />
                  </Stack>
                );
              })}
            </Stack>}
        </DialogContent>
        <DialogActions><Button onClick={() => setPromoOpen(false)}>Done</Button></DialogActions>
      </Dialog>

      <Dialog open={parkedOpen} onClose={() => setParkedOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Parked carts ({parked.length})</DialogTitle>
        <DialogContent>
          {parked.length === 0 ? <Typography color="text.secondary" variant="body2">No parked carts.</Typography> :
            <Stack spacing={1}>
              {parked.map((b) => (
                <Paper key={b.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack direction="row" alignItems="center">
                    <Box sx={{ flex: 1 }}>
                      <Typography fontWeight={600}>{b.bill_no}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {b.lines.length} line{b.lines.length !== 1 ? "s" : ""} ·
                        {b.customer_name ? ` ${b.customer_name} ·` : ""} {new Date(b.created_at).toLocaleTimeString()}
                      </Typography>
                    </Box>
                    <Button size="small" variant="contained" startIcon={<PlayCircleIcon />} onClick={() => reopenParked(b)}>Resume</Button>
                    <IconButton size="small" color="error" onClick={async () => { await api.delete(`/pos/bills/${b.id}/discard/`); loadParked(); }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Paper>
              ))}
            </Stack>}
        </DialogContent>
        <DialogActions><Button onClick={() => setParkedOpen(false)}>Close</Button></DialogActions>
      </Dialog>
    </TerminalShell>
  );
}

export default function TerminalPage() {
  return (
    <ErrorBoundary>
      <IdleLock>
        <TerminalInner />
      </IdleLock>
    </ErrorBoundary>
  );
}

function Row({ l, v }) {
  return <Stack direction="row"><Typography sx={{ flex: 1 }} variant="body2" color="text.secondary">{l}</Typography><Typography variant="body2" fontWeight={600}>{v}</Typography></Stack>;
}

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
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" onClick={() => onConfirm(cash)}>Open</Button></DialogActions>
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
          <Alert severity="info">Opening: {money(shift.opening_cash)} · Cash sales: {money(shift.cash_sales)}<br /><b>Expected: {money(expected)}</b></Alert>
          <TextField autoFocus fullWidth label="Counted cash" value={counted} onChange={(e) => setCounted(e.target.value)} inputProps={{ inputMode: "decimal" }} />
          <Alert severity={variance === 0 ? "success" : Math.abs(variance) < 100 ? "warning" : "error"}>Variance: {money(variance)}</Alert>
          <TextField fullWidth multiline minRows={2} label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" color="warning" onClick={() => onConfirm(counted, note)}>Close</Button></DialogActions>
    </Dialog>
  );
}
function TenderDialog({ open, grandTotal, customer, shift, onClose, onConfirm }) {
  const [rows, setRows] = useState([{ tender: "cash", amount: "", reference: "" }]);
  const [qrUrl, setQrUrl] = useState(null);
  useEffect(() => { if (open) setRows([{ tender: "cash", amount: String(grandTotal.toFixed(2)), reference: "" }]); }, [open, grandTotal]);
  useEffect(() => {
    if (!open || !shift) return;
    if (rows.some((r) => r.tender === "lankaqr") && qrUrl === null) {
      import("../../api/pos").then(({ getOutletSettings }) =>
        getOutletSettings(shift.outlet).then((r) => setQrUrl(r.data.lankaqr_static_qr_url || "")).catch(() => setQrUrl("")));
    }
  }, [open, shift, rows, qrUrl]);

  const paid = rows.reduce((s, r) => s + toNumber(r.amount), 0);
  const change = paid - grandTotal;
  const credit = rows.filter((r) => r.tender === "credit").reduce((s, r) => s + toNumber(r.amount), 0);
  const creditShort = credit > 0 && (!customer || credit > toNumber(customer?.credit_balance));
  const anyQR = rows.some((r) => r.tender === "lankaqr");

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Payment — LKR {money(grandTotal)}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          {rows.map((r, i) => (
            <Stack key={i} direction="row" spacing={1}>
              <TextField select size="small" label="Tender" value={r.tender}
                onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, tender: e.target.value } : x))} sx={{ minWidth: 140 }}>
                {TENDER_OPTIONS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Amount" value={r.amount} sx={{ flex: 1 }} inputProps={{ inputMode: "decimal" }}
                onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
              <TextField size="small" label="Ref" value={r.reference} sx={{ flex: 1 }}
                onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, reference: e.target.value } : x))} />
              <IconButton size="small" color="error" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}><DeleteIcon fontSize="small" /></IconButton>
            </Stack>
          ))}
          <Button startIcon={<AddIcon />} size="small" onClick={() => setRows([...rows, { tender: "cash", amount: "", reference: "" }])}>Split tender</Button>
          <Divider />
          <Row l="Paid" v={`LKR ${money(paid)}`} />
          <Row l="Change" v={`LKR ${money(Math.max(0, change))}`} />
          {paid < grandTotal && <Alert severity="warning">Short by LKR {money(grandTotal - paid)}</Alert>}
          {credit > 0 && !customer && <Alert severity="error">Pick a customer to use credit.</Alert>}
          {credit > 0 && customer && <Alert severity={creditShort ? "error" : "info"}>Credit balance: {money(customer.credit_balance)} · using {money(credit)}</Alert>}
          {anyQR && qrUrl && (
            <Box sx={{ textAlign: "center", p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
              <Typography variant="caption">Ask customer to scan:</Typography>
              <Box><img src={qrUrl} alt="LankaQR" style={{ maxWidth: 220 }} /></Box>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="success" disabled={paid < grandTotal || creditShort}
          onClick={() => onConfirm(rows.filter((r) => toNumber(r.amount) > 0))}>
          Finalize &amp; Print (F8)
        </Button>
      </DialogActions>
    </Dialog>
  );
}

