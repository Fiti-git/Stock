import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, Chip, Typography, InputAdornment, Box,
  Dialog, DialogTitle, DialogContent, DialogActions, MenuItem,
  FormControlLabel, Checkbox,
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import HistoryIcon from "@mui/icons-material/History";
import { listCustomers, createCustomer, updateCustomer, deactivateCustomer,
         adjustCustomerCredit, getCustomerCreditHistory } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

export default function PosCustomersPage() {
  const { notify } = useNotification();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", note: "", tax_exempt: false, tax_exempt_reason: "" });
  const [creditTarget, setCreditTarget] = useState(null);
  const [creditForm, setCreditForm] = useState({ amount: "", kind: "topup", note: "" });
  const [historyTarget, setHistoryTarget] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCustomers({ q: search || undefined, page, page_size: PAGE_SIZE });
      setData(res.data);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed to load customers.", "error");
    } finally {
      setLoading(false);
    }
  }, [search, page, notify]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", phone: "", email: "", address: "", note: "", tax_exempt: false, tax_exempt_reason: "" });
    setEditOpen(true);
  };
  const openEdit = (c) => {
    setEditing(c);
    setForm({
      name: c.name || "", phone: c.phone || "", email: c.email || "",
      address: c.address || "", note: c.note || "",
      tax_exempt: !!c.tax_exempt, tax_exempt_reason: c.tax_exempt_reason || "",
    });
    setEditOpen(true);
  };

  const save = async () => {
    try {
      if (editing) await updateCustomer(editing.id, form);
      else await createCustomer(form);
      notify(editing ? "Customer updated." : "Customer added.", "success");
      setEditOpen(false);
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Save failed.", "error");
    }
  };

  const deactivate = async (c) => {
    if (!window.confirm(`Deactivate ${c.name}?`)) return;
    try { await deactivateCustomer(c.id); load(); } catch { notify("Failed.", "error"); }
  };

  const openCredit = (c) => { setCreditTarget(c); setCreditForm({ amount: "", kind: "topup", note: "" }); };
  const doCredit = async () => {
    try {
      const signed = creditForm.kind === "topup" || creditForm.kind === "refund" ? creditForm.amount : `-${creditForm.amount}`;
      await adjustCustomerCredit(creditTarget.id, signed, creditForm.kind, creditForm.note);
      notify("Credit updated.", "success");
      setCreditTarget(null);
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed.", "error");
    }
  };
  const openHistory = async (c) => {
    setHistoryTarget(c); setHistoryRows([]);
    try { const r = await getCustomerCreditHistory(c.id); setHistoryRows(r.data.results || []); }
    catch { notify("Failed to load history.", "error"); }
  };

  const columns = [
    { field: "name", headerName: "Name", flex: 1.2, minWidth: 160 },
    { field: "phone", headerName: "Phone", flex: 0.8, minWidth: 120 },
    { field: "email", headerName: "Email", flex: 1, minWidth: 160, valueGetter: (v) => v || "—" },
    { field: "loyalty_points", headerName: "Points", flex: 0.5, minWidth: 80, type: "number" },
    { field: "credit_balance", headerName: "Credit", flex: 0.6, minWidth: 90, valueGetter: (v) => Number(v || 0).toFixed(2) },
    { field: "is_active", headerName: "Status", flex: 0.5, minWidth: 90,
      renderCell: (p) => <Chip size="small" label={p.value ? "Active" : "Inactive"} color={p.value ? "success" : "default"} /> },
    {
      field: "_actions", headerName: "", flex: 1.2, minWidth: 250, sortable: false,
      renderCell: (p) => (
        <Stack direction="row" spacing={0.5}>
          <Button size="small" onClick={() => openEdit(p.row)}>Edit</Button>
          <Button size="small" color="secondary" startIcon={<AccountBalanceWalletIcon />} onClick={() => openCredit(p.row)}>Credit</Button>
          <Button size="small" startIcon={<HistoryIcon />} onClick={() => openHistory(p.row)}>History</Button>
          {p.row.is_active && <Button size="small" color="warning" onClick={() => deactivate(p.row)}>Deactivate</Button>}
        </Stack>
      ),
    },
  ];

  return (
    <Layout>
      <PageHeader title="POS Customers" subtitle="Customer directory and loyalty" icon={<PersonIcon />} />
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" placeholder="Search name or phone" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
        <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={openCreate}>Add</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">{data?.count || 0} customer{data?.count !== 1 ? "s" : ""}</Typography>
      <DataTable
        rows={data?.results ?? []} columns={columns} loading={loading}
        paginationMode="server" rowCount={data?.count ?? 0}
        paginationModel={{ page: page - 1, pageSize: PAGE_SIZE }}
        onPaginationModelChange={(m) => setPage(m.page + 1)}
        pageSizeOptions={[PAGE_SIZE]} height={600} emptyText="No customers"
      />

      <Dialog open={!!creditTarget} onClose={() => setCreditTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Credit — {creditTarget?.name}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Current balance: <b>LKR {Number(creditTarget?.credit_balance || 0).toFixed(2)}</b>
            </Typography>
            <TextField select label="Kind" value={creditForm.kind} onChange={(e) => setCreditForm({ ...creditForm, kind: e.target.value })}>
              <MenuItem value="topup">Top-up (add)</MenuItem>
              <MenuItem value="refund">Refund (add)</MenuItem>
              <MenuItem value="adjust">Adjust (add)</MenuItem>
              <MenuItem value="redeem">Redeem (deduct)</MenuItem>
            </TextField>
            <TextField label="Amount (LKR)" value={creditForm.amount}
              onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })}
              inputProps={{ inputMode: "decimal" }} autoFocus />
            <TextField label="Note" value={creditForm.note} onChange={(e) => setCreditForm({ ...creditForm, note: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreditTarget(null)}>Cancel</Button>
          <Button variant="contained" onClick={doCredit} disabled={!creditForm.amount || Number(creditForm.amount) === 0}>Apply</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!historyTarget} onClose={() => setHistoryTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Credit history — {historyTarget?.name}</DialogTitle>
        <DialogContent>
          {historyRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No credit activity.</Typography>
          ) : (
            <Stack spacing={1}>
              {historyRows.map((h) => (
                <Stack key={h.id} direction="row" sx={{ p: 1, border: 1, borderColor: "divider", borderRadius: 1 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600}>{h.kind}</Typography>
                    <Typography variant="caption" color="text.secondary">{new Date(h.created_at).toLocaleString()} · {h.note || "—"}</Typography>
                  </Box>
                  <Stack alignItems="flex-end">
                    <Typography variant="body2" fontWeight={700} color={Number(h.amount) >= 0 ? "success.main" : "error.main"}>
                      {Number(h.amount) > 0 ? "+" : ""}{Number(h.amount).toFixed(2)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Bal: {Number(h.balance_after).toFixed(2)}</Typography>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryTarget(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? "Edit customer" : "Add customer"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <TextField label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <TextField label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <TextField label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <TextField label="Note" multiline minRows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <FormControlLabel
              control={<Checkbox checked={!!form.tax_exempt} onChange={(e) => setForm({ ...form, tax_exempt: e.target.checked })} />}
              label="Tax exempt"
            />
            {form.tax_exempt && (
              <TextField label="Tax exempt reason" value={form.tax_exempt_reason}
                onChange={(e) => setForm({ ...form, tax_exempt_reason: e.target.value })} />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={!form.name.trim()}>Save</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
