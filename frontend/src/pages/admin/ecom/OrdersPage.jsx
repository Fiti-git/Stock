import { useEffect, useMemo, useState } from "react";
import {
  Stack, TextField, MenuItem, Chip, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, Typography, Alert, Box, IconButton,
} from "@mui/material";
import ShoppingBagIcon from "@mui/icons-material/ShoppingBag";
import CloseIcon from "@mui/icons-material/Close";
import Layout from "../../../components/Layout";
import { PageHeader, DataTable, EmptyState } from "../../../components/ui";
import {
  listEcomOrders, getEcomOrder, confirmEcomPayment, cancelEcomOrder,
} from "../../../api/ecom";

const STATUSES = [
  "", "pending_payment", "paid", "fulfilling", "shipped", "delivered",
  "cancelled", "refunded",
];

const statusColor = (s) => ({
  pending_payment: "warning",
  paid: "success",
  fulfilling: "info",
  shipped: "info",
  delivered: "success",
  cancelled: "default",
  refunded: "default",
}[s] || "default");

const fmtMoney = (v) => v == null ? "—" : Number(v).toLocaleString(undefined, {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const fmtDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d) ? "—" : d.toLocaleString();
};

function OrderDrawer({ number, onClose, onChanged }) {
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!number) return;
    getEcomOrder(number).then(({ data }) => setOrder(data)).catch(() => setError("Could not load order."));
  }, [number]);

  const action = async (fn, ...args) => {
    setBusy(true); setError(null);
    try {
      const { data } = await fn(...args);
      setOrder(data);
      onChanged?.();
    } catch (e) {
      setError(e?.response?.data?.detail || "Action failed.");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Box>
          <Typography variant="h4">{number}</Typography>
          {order && (
            <Chip
              size="small"
              color={statusColor(order.status)}
              label={order.status}
              sx={{ mt: 0.5, textTransform: "uppercase", letterSpacing: "0.06em" }}
            />
          )}
        </Box>
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!order ? <EmptyState title="Loading…" /> : (
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle2">Customer</Typography>
              <Typography variant="body2" color="text.secondary">
                {order.customer_id ? `Customer #${order.customer_id}` :
                  `${order.guest_name || "—"} · ${order.guest_email || ""} · ${order.guest_phone || ""}`}
              </Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2">
                {order.fulfilment_method === "pickup" ? "Fulfilment · Pickup" : "Shipping"}
              </Typography>
              {order.fulfilment_method === "pickup" ? (
                <Typography variant="body2" color="text.secondary">
                  Customer will collect from <b>{order.pickup_outlet_name || "outlet #" + order.pickup_outlet_id}</b>.
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-line" }}>
                  {[order.shipping_address?.recipient_name, order.shipping_address?.line1,
                    order.shipping_address?.line2, order.shipping_address?.city,
                    order.shipping_address?.country].filter(Boolean).join("\n") || "—"}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                Payment: {(order.payment_method || "").replace("_", " ")}
                {order.payhere_payment_id ? ` · PayHere #${order.payhere_payment_id}` : ""}
              </Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2">Lines</Typography>
              <DataTable
                rows={(order.lines || []).map((l) => ({ id: l.id, ...l }))}
                columns={[
                  { field: "item_code_snapshot", headerName: "Code", width: 120 },
                  { field: "item_name_snapshot", headerName: "Item", flex: 1.6, minWidth: 200 },
                  { field: "qty", headerName: "Qty", type: "number", width: 90 },
                  { field: "unit_price", headerName: "Unit", type: "number", width: 100, valueFormatter: fmtMoney },
                  { field: "line_subtotal", headerName: "Subtotal", type: "number", width: 110, valueFormatter: fmtMoney },
                  { field: "tax_amount", headerName: "Tax", type: "number", width: 90, valueFormatter: fmtMoney },
                  { field: "line_total", headerName: "Total", type: "number", width: 110, valueFormatter: fmtMoney },
                  {
                    field: "is_committed", headerName: "Ledger", width: 100,
                    renderCell: (p) => p.value
                      ? <Chip size="small" color="success" label="committed" />
                      : <Chip size="small" color="default" label="—" />,
                  },
                ]}
                toolbar={false}
                height={260}
                initialPageSize={10}
              />
            </Box>
            <Stack direction="row" spacing={3} flexWrap="wrap">
              <Box><Typography variant="caption" color="text.secondary">Subtotal</Typography>
                <Typography variant="subtitle2">{fmtMoney(order.subtotal)}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Tax</Typography>
                <Typography variant="subtitle2">{fmtMoney(order.tax_total)}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Shipping</Typography>
                <Typography variant="subtitle2">{fmtMoney(order.shipping_total)}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">Grand total</Typography>
                <Typography variant="h5">{order.currency} {fmtMoney(order.grand_total)}</Typography></Box>
            </Stack>
            <Stack direction="row" spacing={2}>
              <Box flex={1}>
                <Typography variant="caption" color="text.secondary">Created</Typography>
                <Typography variant="body2">{fmtDateTime(order.created_at)}</Typography>
              </Box>
              <Box flex={1}>
                <Typography variant="caption" color="text.secondary">Paid</Typography>
                <Typography variant="body2">{fmtDateTime(order.paid_at)}</Typography>
              </Box>
              <Box flex={1}>
                <Typography variant="caption" color="text.secondary">Cancelled</Typography>
                <Typography variant="body2">{fmtDateTime(order.cancelled_at)}</Typography>
              </Box>
            </Stack>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {order?.status === "pending_payment" && (
          <>
            <Button color="warning" disabled={busy}
              onClick={() => action(cancelEcomOrder, number, "admin cancel")}>
              Cancel order
            </Button>
            <Button variant="contained" color="success" disabled={busy}
              onClick={() => action(confirmEcomPayment, number, "")}>
              Confirm payment
            </Button>
          </>
        )}
        <Button onClick={onClose} color="inherit">Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function EcomOrdersPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openNumber, setOpenNumber] = useState(null);

  const refresh = () => {
    setLoading(true); setError(null);
    listEcomOrders({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(q ? { q } : {}),
      page, page_size: pageSize,
    })
      .then(({ data }) => {
        setRows((data.results || []).map((r) => ({ id: r.id, ...r })));
        setCount(data.count || 0);
      })
      .catch(() => setError("Could not load orders."))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [statusFilter, q, page, pageSize]);

  const columns = useMemo(() => [
    { field: "number", headerName: "Order #", width: 170 },
    {
      field: "status", headerName: "Status", width: 140,
      renderCell: (p) => <Chip size="small" color={statusColor(p.value)} label={p.value} />,
    },
    { field: "outlet_id", headerName: "Outlet", width: 90, type: "number" },
    {
      field: "buyer", headerName: "Buyer", flex: 1, minWidth: 180,
      valueGetter: (_v, r) => r.customer_id ? `Cust #${r.customer_id}`
        : (r.guest_name || r.guest_email || r.guest_phone || "guest"),
    },
    {
      field: "grand_total", headerName: "Total", type: "number", width: 130,
      renderCell: (p) => `${p.row.currency} ${fmtMoney(p.value)}`,
    },
    { field: "created_at", headerName: "Created", width: 170, valueFormatter: fmtDateTime },
    { field: "paid_at", headerName: "Paid", width: 170, valueFormatter: fmtDateTime },
    {
      field: "_actions", headerName: " ", width: 100, sortable: false,
      renderCell: (p) => (
        <Button size="small" onClick={() => setOpenNumber(p.row.number)}>View</Button>
      ),
    },
  ], []);

  return (
    <Layout>
      <PageHeader
        title="Ecom Orders"
        subtitle="Customer orders from the storefront — confirm payment, cancel, or inspect line items"
        icon={<ShoppingBagIcon />}
        actions={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <TextField
              size="small" select label="Status" value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              sx={{ minWidth: 160 }}
            >
              {STATUSES.map((s) => <MenuItem key={s} value={s}>{s || "All"}</MenuItem>)}
            </TextField>
            <TextField
              size="small" label="Search" value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="number, name, phone, email…"
              sx={{ minWidth: 240 }}
            />
            <Button onClick={refresh}>Refresh</Button>
          </Stack>
        }
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <DataTable
        rows={rows}
        columns={columns}
        loading={loading}
        toolbar
        height={600}
        initialPageSize={pageSize}
        pageSizeOptions={[10, 25, 50, 100]}
        rowCount={count}
        paginationMode="server"
        page={page - 1}
        onPaginationModelChange={(m) => {
          if (m.pageSize !== pageSize) setPageSize(m.pageSize);
          setPage((m.page || 0) + 1);
        }}
      />
      {openNumber && (
        <OrderDrawer
          number={openNumber}
          onClose={() => setOpenNumber(null)}
          onChanged={refresh}
        />
      )}
    </Layout>
  );
}
