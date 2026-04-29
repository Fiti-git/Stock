import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, Chip, Typography, Box,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert,
} from "@mui/material";
import CardGiftcardIcon from "@mui/icons-material/CardGiftcard";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import {
  listGiftCards, issueGiftCard, getGiftCard,
  adjustGiftCard, voidGiftCard, searchCustomers,
} from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

const dtLocal = (d) => {
  if (!d) return "";
  const dt = new Date(d); const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

export default function PosGiftCardsPage() {
  const { notify } = useNotification();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [detail, setDetail] = useState(null); // {serial, current_balance, status, txns}
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ amount: "", note: "" });

  // issue form
  const [issueForm, setIssueForm] = useState({
    serial: "", initial_balance: "", customer_id: "", customer_label: "",
    expires_at: "",
  });
  const [custResults, setCustResults] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listGiftCards();
      setRows(r.data.results || r.data || []);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    } finally { setLoading(false); }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (serial) => {
    try {
      const r = await getGiftCard(serial);
      setDetail(r.data);
    } catch (err) {
      notify(err?.response?.data?.detail || "Lookup failed.", "error");
    }
  };

  const refreshDetail = async () => {
    if (!detail?.serial) return;
    try {
      const r = await getGiftCard(detail.serial);
      setDetail(r.data);
    } catch { /* ignore */ }
  };

  const submitIssue = async () => {
    const payload = {
      initial_balance: issueForm.initial_balance,
      ...(issueForm.serial ? { serial: issueForm.serial } : {}),
      ...(issueForm.customer_id ? { customer_id: Number(issueForm.customer_id) } : {}),
      ...(issueForm.expires_at ? { expires_at: new Date(issueForm.expires_at).toISOString() } : {}),
    };
    try {
      await issueGiftCard(payload);
      notify("Gift card issued.", "success");
      setIssueOpen(false);
      setIssueForm({ serial: "", initial_balance: "", customer_id: "", customer_label: "", expires_at: "" });
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || JSON.stringify(err?.response?.data) || "Failed.", "error");
    }
  };

  const searchCustomer = async (q) => {
    setIssueForm((f) => ({ ...f, customer_label: q, customer_id: "" }));
    if (q.length < 2) { setCustResults([]); return; }
    try { const r = await searchCustomers(q); setCustResults(r.data || []); } catch { /* */ }
  };

  const submitAdjust = async () => {
    if (!detail?.serial || !adjustForm.amount) return;
    try {
      await adjustGiftCard(detail.serial, adjustForm.amount, adjustForm.note);
      notify("Adjustment posted.", "success");
      setAdjustOpen(false);
      setAdjustForm({ amount: "", note: "" });
      await refreshDetail();
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    }
  };

  const doVoid = async () => {
    if (!detail?.serial) return;
    if (!window.confirm(`Void gift card ${detail.serial}?`)) return;
    try {
      await voidGiftCard(detail.serial);
      notify("Card voided.", "success");
      await refreshDetail();
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    }
  };

  const cols = [
    { field: "serial", headerName: "Serial", flex: 1, minWidth: 140 },
    { field: "customer_name", headerName: "Customer", flex: 1, minWidth: 140,
      valueGetter: (_, r) => r.customer_name || (r.customer_id ? `#${r.customer_id}` : "—") },
    { field: "initial_balance", headerName: "Initial", flex: 0.6, minWidth: 90,
      valueGetter: (v) => Number(v || 0).toFixed(2) },
    { field: "current_balance", headerName: "Balance", flex: 0.6, minWidth: 100,
      valueGetter: (v) => Number(v || 0).toFixed(2) },
    { field: "status", headerName: "Status", flex: 0.5, minWidth: 100,
      renderCell: (p) => (
        <Chip size="small" label={p.value}
          color={p.value === "ACTIVE" ? "success" : (p.value === "VOID" ? "error" : "default")} />
      ),
    },
    { field: "expires_at", headerName: "Expires", flex: 0.8, minWidth: 140,
      valueGetter: (v) => v ? new Date(v).toLocaleString() : "—" },
  ];

  return (
    <Layout>
      <PageHeader title="Gift Cards" subtitle="Issue, adjust, and void prepaid balances" icon={<CardGiftcardIcon />} />
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
        <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={() => setIssueOpen(true)}>Issue card</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">{rows.length} card{rows.length !== 1 ? "s" : ""}</Typography>
      <DataTable
        rows={rows}
        columns={cols}
        loading={loading}
        getRowId={(r) => r.id || r.serial}
        height={600}
        emptyText="No gift cards"
        onRowClick={(p) => openDetail(p.row.serial)}
      />

      {/* Issue dialog */}
      <Dialog open={issueOpen} onClose={() => setIssueOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Issue gift card</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Serial (blank = auto)" value={issueForm.serial}
              onChange={(e) => setIssueForm({ ...issueForm, serial: e.target.value })} />
            <TextField label="Initial balance (LKR)" value={issueForm.initial_balance}
              onChange={(e) => setIssueForm({ ...issueForm, initial_balance: e.target.value })}
              inputProps={{ inputMode: "decimal" }} required />
            <Box sx={{ position: "relative" }}>
              <TextField fullWidth label="Customer (optional)" value={issueForm.customer_label}
                onChange={(e) => searchCustomer(e.target.value)}
                helperText={issueForm.customer_id ? `Linked customer id ${issueForm.customer_id}` : "Type name or phone, or leave blank"} />
              {custResults.length > 0 && (
                <Box sx={{ position: "absolute", zIndex: 20, left: 0, right: 0, bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: 1, maxHeight: 200, overflow: "auto", mt: 0.5 }}>
                  {custResults.map((c) => (
                    <Box key={c.id} sx={{ p: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
                      onClick={() => {
                        setIssueForm((f) => ({ ...f, customer_id: String(c.id), customer_label: `${c.name} · ${c.phone}` }));
                        setCustResults([]);
                      }}>
                      <Typography variant="body2" fontWeight={600}>{c.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{c.phone}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
            <TextField type="datetime-local" label="Expires at (optional)" InputLabelProps={{ shrink: true }}
              value={issueForm.expires_at}
              onChange={(e) => setIssueForm({ ...issueForm, expires_at: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIssueOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!issueForm.initial_balance} onClick={submitIssue}>Issue</Button>
        </DialogActions>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!detail} onClose={() => setDetail(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          {detail?.serial}{" "}
          {detail?.status && (
            <Chip size="small" sx={{ ml: 1 }} label={detail.status}
              color={detail.status === "ACTIVE" ? "success" : (detail.status === "VOID" ? "error" : "default")} />
          )}
        </DialogTitle>
        <DialogContent>
          {detail && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Alert severity="info">
                Current balance: <b>LKR {Number(detail.current_balance || 0).toFixed(2)}</b>
                {detail.expires_at && <> · Expires {new Date(detail.expires_at).toLocaleString()}</>}
              </Alert>
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" disabled={detail.status !== "ACTIVE"} onClick={() => setAdjustOpen(true)}>Adjust</Button>
                <Button variant="outlined" color="error" disabled={detail.status !== "ACTIVE"} onClick={doVoid}>Void</Button>
              </Stack>
              <Typography variant="subtitle2" sx={{ mt: 1 }}>Transaction history</Typography>
              <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, maxHeight: 280, overflow: "auto" }}>
                {(detail.txns || []).length === 0 ? (
                  <Box sx={{ p: 2, textAlign: "center", color: "text.secondary" }}>No transactions</Box>
                ) : (detail.txns || []).map((t, i) => (
                  <Stack key={t.id || i} direction="row" spacing={1} sx={{ p: 1, borderBottom: 1, borderColor: "divider" }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {t.kind || t.type || "txn"} {t.note && <Typography component="span" variant="caption" color="text.secondary"> — {t.note}</Typography>}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t.created_at ? new Date(t.created_at).toLocaleString() : ""}
                        {t.bill_no && ` · Bill ${t.bill_no}`}
                      </Typography>
                    </Box>
                    <Typography variant="body2" fontWeight={600}
                      color={Number(t.amount) < 0 ? "error.main" : "success.main"}>
                      {Number(t.amount) >= 0 ? "+" : ""}{Number(t.amount).toFixed(2)}
                    </Typography>
                  </Stack>
                ))}
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetail(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Adjust dialog */}
      <Dialog open={adjustOpen} onClose={() => setAdjustOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Adjust balance</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Use a positive amount to top up, negative to deduct.
            </Typography>
            <TextField label="Amount (LKR)" value={adjustForm.amount}
              onChange={(e) => setAdjustForm({ ...adjustForm, amount: e.target.value })}
              inputProps={{ inputMode: "decimal" }} />
            <TextField label="Note" multiline minRows={2} value={adjustForm.note}
              onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdjustOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!adjustForm.amount} onClick={submitAdjust}>Save</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
