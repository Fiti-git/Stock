import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, MenuItem, Typography, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material";
import PaymentsIcon from "@mui/icons-material/Payments";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { listExpenses, createExpense } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

export default function PosExpensesPage() {
  const { notify } = useNotification();
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kind: "petty", amount: "", note: "", paid_to: "", receipt_ref: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listExpenses({ date_from: dateFrom, date_to: dateTo });
      setData(r.data);
    } finally { setLoading(false); }
  }, [dateFrom, dateTo]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      await createExpense(form);
      notify("Expense recorded.", "success");
      setOpen(false); setForm({ kind: "petty", amount: "", note: "", paid_to: "", receipt_ref: "" });
      load();
    } catch (err) { notify(err?.response?.data?.detail || "Failed.", "error"); }
  };

  const cols = [
    { field: "created_at", headerName: "When", flex: 1, minWidth: 150, valueGetter: (v) => new Date(v).toLocaleString() },
    { field: "kind", headerName: "Kind", flex: 0.5, minWidth: 90, renderCell: (p) => <Chip size="small" label={p.value} /> },
    { field: "amount", headerName: "Amount", flex: 0.6, minWidth: 100, valueGetter: (v) => Number(v).toFixed(2) },
    { field: "paid_to", headerName: "Paid to", flex: 1, minWidth: 120, valueGetter: (v) => v || "—" },
    { field: "note", headerName: "Note", flex: 1.5, minWidth: 180 },
    { field: "receipt_ref", headerName: "Ref", flex: 0.6, minWidth: 90, valueGetter: (v) => v || "—" },
    { field: "created_by", headerName: "By", flex: 0.6, minWidth: 90, valueGetter: (v) => v || "—" },
  ];

  return (
    <Layout>
      <PageHeader title="Expenses" subtitle="Petty cash and shift-level expenses" icon={<PaymentsIcon />} />
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
        <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Add expense</Button>
      </Stack>
      {data && <Typography variant="caption" color="text.secondary">{data.count} expense{data.count !== 1 ? "s" : ""} · Total LKR {Number(data.total_amount || 0).toFixed(2)}</Typography>}
      <DataTable rows={data?.results ?? []} columns={cols} loading={loading} getRowId={(r) => r.id} height={600} emptyText="No expenses" />

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add expense</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <MenuItem value="petty">Petty cash</MenuItem>
              <MenuItem value="utility">Utility</MenuItem>
              <MenuItem value="salary">Salary / wage</MenuItem>
              <MenuItem value="rent">Rent</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </TextField>
            <TextField label="Amount (LKR)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputProps={{ inputMode: "decimal" }} autoFocus />
            <TextField label="Paid to" value={form.paid_to} onChange={(e) => setForm({ ...form, paid_to: e.target.value })} />
            <TextField label="Receipt / reference" value={form.receipt_ref} onChange={(e) => setForm({ ...form, receipt_ref: e.target.value })} />
            <TextField label="Note" multiline minRows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={!form.amount || Number(form.amount) <= 0}>Save</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
