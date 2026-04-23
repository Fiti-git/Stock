import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, MenuItem, Button, Chip, Typography, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, Box,
} from "@mui/material";
import ReceiptIcon from "@mui/icons-material/Receipt";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { listBills, voidBill, getBill } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

const STATUS_COLORS = {
  draft: "default", closed: "success", void: "error", returned: "warning",
};

export default function PosBillsPage() {
  const { notify } = useNotification();
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [viewBill, setViewBill] = useState(null);

  const PAGE_SIZE = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBills({
        date_from: dateFrom, date_to: dateTo,
        ...(status ? { status } : {}),
        ...(search ? { search } : {}),
        page, page_size: PAGE_SIZE,
      });
      setData(res.data);
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed to load bills.", "error");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, status, search, page, notify]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [dateFrom, dateTo, status, search]);

  const handleVoid = async () => {
    if (!voidTarget || !voidReason.trim()) return;
    try {
      await voidBill(voidTarget.id, voidReason.trim());
      notify(`Bill ${voidTarget.bill_no} voided.`, "success");
      setVoidTarget(null); setVoidReason("");
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Void failed.", "error");
    }
  };

  const viewDetail = async (id) => {
    try {
      const res = await getBill(id);
      setViewBill(res.data);
    } catch {
      notify("Failed to load bill.", "error");
    }
  };

  const columns = [
    { field: "bill_no", headerName: "Bill No", flex: 0.9, minWidth: 130,
      renderCell: (p) => <Button size="small" onClick={() => viewDetail(p.row.id)}>{p.value}</Button> },
    { field: "created_at", headerName: "When", flex: 1, minWidth: 140, valueGetter: (v) => new Date(v).toLocaleString() },
    { field: "cashier_username", headerName: "Cashier", flex: 0.8, minWidth: 100 },
    { field: "kind", headerName: "Kind", flex: 0.5, minWidth: 80,
      renderCell: (p) => <Chip size="small" label={p.value} variant="outlined" /> },
    { field: "status", headerName: "Status", flex: 0.6, minWidth: 90,
      renderCell: (p) => <Chip size="small" label={p.value} color={STATUS_COLORS[p.value] || "default"} /> },
    { field: "customer_name", headerName: "Customer", flex: 1, minWidth: 120, valueGetter: (v) => v || "—" },
    { field: "grand_total", headerName: "Total", type: "number", flex: 0.7, minWidth: 100,
      valueGetter: (v) => Number(v),
      renderCell: (p) => <b>{Number(p.value).toFixed(2)}</b> },
    {
      field: "_actions", headerName: "", flex: 0.6, minWidth: 90, sortable: false,
      renderCell: (p) => p.row.status === "closed" ? (
        <Button size="small" color="error" onClick={() => setVoidTarget(p.row)}>Void</Button>
      ) : null,
    },
  ];

  return (
    <Layout>
      <PageHeader title="POS Bills" subtitle="Transaction history and void controls" icon={<ReceiptIcon />} />

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <TextField size="small" select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="closed">Closed</MenuItem>
          <MenuItem value="void">Void</MenuItem>
          <MenuItem value="draft">Draft</MenuItem>
        </TextField>
        <TextField size="small" placeholder="Bill no / customer / phone" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: 1 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
      </Stack>

      {data && <Typography variant="caption" color="text.secondary">{data.count} bill{data.count !== 1 ? "s" : ""}</Typography>}

      <DataTable
        rows={data?.results ?? []} columns={columns} loading={loading}
        paginationMode="server" rowCount={data?.count ?? 0}
        paginationModel={{ page: page - 1, pageSize: PAGE_SIZE }}
        onPaginationModelChange={(m) => setPage(m.page + 1)}
        pageSizeOptions={[PAGE_SIZE]} emptyText="No bills" height={600}
      />

      <Dialog open={!!voidTarget} onClose={() => setVoidTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Void bill {voidTarget?.bill_no}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Voiding is final. The bill stays in the audit trail but no longer counts toward sales.
          </Alert>
          <TextField autoFocus fullWidth multiline minRows={3} label="Reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVoidTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleVoid} disabled={!voidReason.trim()}>Void</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!viewBill} onClose={() => setViewBill(null)} fullWidth maxWidth="sm">
        <DialogTitle>Bill {viewBill?.bill_no}</DialogTitle>
        <DialogContent>
          {viewBill && (
            <Box sx={{ fontFamily: "monospace", fontSize: 13 }}>
              <div>Cashier: {viewBill.cashier_username}</div>
              <div>When: {new Date(viewBill.created_at).toLocaleString()}</div>
              <div>Status: {viewBill.status}</div>
              <hr />
              {viewBill.lines.map((l) => (
                <div key={l.id} style={{ display: "flex" }}>
                  <span style={{ flex: 1 }}>{l.item_code} · {l.qty} × {Number(l.unit_price).toFixed(2)}</span>
                  <span><b>{Number(l.line_total).toFixed(2)}</b></span>
                </div>
              ))}
              <hr />
              <div style={{ display: "flex" }}><span style={{ flex: 1 }}>Subtotal</span><span>{Number(viewBill.subtotal).toFixed(2)}</span></div>
              <div style={{ display: "flex" }}><span style={{ flex: 1 }}>Discount</span><span>{Number(viewBill.bill_discount).toFixed(2)}</span></div>
              <div style={{ display: "flex" }}><span style={{ flex: 1 }}>Tax</span><span>{Number(viewBill.tax_total).toFixed(2)}</span></div>
              <div style={{ display: "flex", fontSize: 15 }}><span style={{ flex: 1 }}><b>Total</b></span><span><b>{Number(viewBill.grand_total).toFixed(2)}</b></span></div>
              <hr />
              <div>Payments:</div>
              {viewBill.payments.map((p) => (
                <div key={p.id} style={{ display: "flex" }}>
                  <span style={{ flex: 1 }}>{p.tender} {p.reference && `(${p.reference})`}</span>
                  <span>{Number(p.amount).toFixed(2)}</span>
                </div>
              ))}
              {viewBill.void_reason && (
                <div style={{ marginTop: 8, color: "#d32f2f" }}>Voided: {viewBill.void_reason}</div>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewBill(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
}
