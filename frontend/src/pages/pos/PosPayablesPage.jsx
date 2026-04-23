import { useState, useEffect, useCallback } from "react";
import {
  Stack, Button, Typography, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Box,
} from "@mui/material";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, StatCard } from "../../components/ui";
import { getSupplierPayables, createSupplierPayment, getSupplierLedger } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

export default function PosPayablesPage() {
  const { notify } = useNotification();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState("0");
  const [loading, setLoading] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState(null);
  const [payForm, setPayForm] = useState({ amount: "", reference: "", note: "" });
  const [ledgerTarget, setLedgerTarget] = useState(null);
  const [ledger, setLedger] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getSupplierPayables();
      setRows(r.data.results || []);
      setTotal(r.data.total_payable || "0");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openPay = (s) => { setPayTarget(s); setPayForm({ amount: "", reference: "", note: "" }); setPayOpen(true); };
  const doPay = async () => {
    try {
      await createSupplierPayment({
        supplier_id: payTarget.supplier_id,
        amount: payForm.amount,
        reference: payForm.reference, note: payForm.note,
      });
      notify("Payment recorded.", "success");
      setPayOpen(false); load();
    } catch (err) { notify(err?.response?.data?.detail || "Failed.", "error"); }
  };
  const openLedger = async (s) => {
    setLedgerTarget(s);
    try { const r = await getSupplierLedger(s.supplier_id); setLedger(r.data.results || []); }
    catch { notify("Failed.", "error"); }
  };

  const cols = [
    { field: "supplier_code", headerName: "Code", flex: 0.5, minWidth: 100 },
    { field: "supplier_name", headerName: "Supplier", flex: 1.5, minWidth: 200 },
    { field: "payable_balance", headerName: "Payable (LKR)", flex: 0.8, minWidth: 140,
      renderCell: (p) => {
        const n = Number(p.value);
        return <b style={{ color: n > 0 ? "#d32f2f" : "#2e7d32" }}>{n.toFixed(2)}</b>;
      },
    },
    {
      field: "_actions", headerName: "", flex: 0.7, minWidth: 150, sortable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5}>
          <Button size="small" variant="contained" onClick={() => openPay(p.row)} disabled={Number(p.row.payable_balance) <= 0}>Pay</Button>
          <Button size="small" onClick={() => openLedger(p.row)}>Ledger</Button>
        </Stack>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader title="Supplier Payables" subtitle="Outstanding amounts owed to suppliers" icon={<AccountBalanceIcon />} />
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 2, mb: 2 }}>
        <StatCard label="Total payable" value={`LKR ${Number(total).toFixed(2)}`} />
        <StatCard label="Suppliers" value={rows.length} />
      </Box>
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </Stack>
      <DataTable rows={rows} columns={cols} loading={loading} getRowId={(r) => r.supplier_id} height={550} emptyText="No open payables" />

      <Dialog open={payOpen} onClose={() => setPayOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Pay {payTarget?.supplier_name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">Current payable: LKR {Number(payTarget?.payable_balance || 0).toFixed(2)}</Typography>
            <TextField label="Amount (LKR)" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} autoFocus inputProps={{ inputMode: "decimal" }} />
            <TextField label="Reference" value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
            <TextField label="Note" value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={doPay} disabled={!payForm.amount || Number(payForm.amount) <= 0}>Record payment</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!ledgerTarget} onClose={() => setLedgerTarget(null)} fullWidth maxWidth="md">
        <DialogTitle>Ledger — {ledgerTarget?.supplier_name}</DialogTitle>
        <DialogContent>
          {ledger.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No ledger entries.</Typography>
          ) : (
            <Stack spacing={1}>
              {ledger.map((t) => (
                <Stack key={t.id} direction="row" sx={{ p: 1, border: 1, borderColor: "divider", borderRadius: 1 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600}>{t.kind}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(t.created_at).toLocaleString()} · {t.ref_type}{t.ref_id && ` #${t.ref_id}`} · {t.note || "—"}
                    </Typography>
                  </Box>
                  <Stack alignItems="flex-end">
                    <Typography fontWeight={600} color={Number(t.amount) >= 0 ? "error.main" : "success.main"}>
                      {Number(t.amount) > 0 ? "+" : ""}{Number(t.amount).toFixed(2)}
                    </Typography>
                    <Typography variant="caption">Bal: {Number(t.balance_after).toFixed(2)}</Typography>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLedgerTarget(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
