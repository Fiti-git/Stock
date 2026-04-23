import { useState } from "react";
import { Stack, TextField, Button, Typography, Paper, Box, Alert, Divider } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { getShiftZReport } from "../../api/pos";
import { useNotification } from "../../providers/NotificationProvider";

const fmt = (v) => Number(v || 0).toFixed(2);

export default function PosZReportPage() {
  const { notify } = useNotification();
  const [shiftId, setShiftId] = useState("");
  const [data, setData] = useState(null);

  const load = async () => {
    if (!shiftId) return;
    try { const r = await getShiftZReport(shiftId); setData(r.data); }
    catch (err) { notify(err?.response?.data?.detail || "Failed.", "error"); setData(null); }
  };

  const print = () => {
    if (!data) return;
    const tenders = Object.entries(data.tenders || {})
      .map(([k, v]) => `<tr><td>${k.toUpperCase()}</td><td class="right">${fmt(v)}</td></tr>`).join("");
    const w = window.open("", "_blank", "width=360,height=700");
    if (!w) return;
    w.document.write(`<html><head><title>Z Report ${data.shift_id}</title>
      <style>body{font-family:monospace;font-size:12px;padding:8px;width:280px}
        .center{text-align:center}.right{text-align:right}
        table{width:100%;border-collapse:collapse}td{padding:2px 0}
        .sep{border-top:1px dashed #000;margin:4px 0}
      </style></head><body>
        <div class="center"><b>Z REPORT</b></div>
        <div class="center">${data.outlet_name}</div>
        <div class="center">Shift #${data.shift_id} · ${data.cashier}</div>
        <div class="center">${new Date(data.opened_at).toLocaleString()}</div>
        ${data.closed_at ? `<div class="center">→ ${new Date(data.closed_at).toLocaleString()}</div>` : ""}
        <div class="sep"></div>
        <table>
          <tr><td>Bills</td><td class="right">${data.bill_count}</td></tr>
          <tr><td>Voided</td><td class="right">${data.voided_count}</td></tr>
          <tr><td>Grand total</td><td class="right">${fmt(data.grand_total)}</td></tr>
          <tr><td>Returns</td><td class="right">${fmt(data.returns_total)}</td></tr>
          <tr><td>Discount</td><td class="right">${fmt(data.discount_total)}</td></tr>
          <tr><td>Tax</td><td class="right">${fmt(data.tax_total)}</td></tr>
          <tr><td>Expenses</td><td class="right">${fmt(data.expense_total)}</td></tr>
        </table>
        <div class="sep"></div>
        <table>${tenders}</table>
        <div class="sep"></div>
        <table>
          <tr><td>Opening</td><td class="right">${fmt(data.opening_cash)}</td></tr>
          <tr><td>Expected</td><td class="right">${fmt(data.expected_cash)}</td></tr>
          ${data.counted_cash !== null ? `<tr><td>Counted</td><td class="right">${fmt(data.counted_cash)}</td></tr>` : ""}
          ${data.cash_variance !== null ? `<tr><td><b>Variance</b></td><td class="right"><b>${fmt(data.cash_variance)}</b></td></tr>` : ""}
        </table>
        <div class="sep"></div>
        <div class="center">— END —</div>
        <script>window.print();window.close();</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <Layout>
      <PageHeader title="Shift Z Report" subtitle="Printable end-of-shift summary" icon={<PrintIcon />} />
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField size="small" label="Shift ID" value={shiftId} onChange={(e) => setShiftId(e.target.value)} sx={{ width: 150 }} />
        <Button variant="contained" onClick={load}>Load</Button>
        <Button variant="contained" color="success" startIcon={<PrintIcon />} onClick={print} disabled={!data}>Print</Button>
      </Stack>

      {!data ? (
        <Alert severity="info">Enter a shift ID and click Load.</Alert>
      ) : (
        <Paper sx={{ p: 3, maxWidth: 500, fontFamily: "monospace" }}>
          <Typography variant="h6" align="center">Z REPORT</Typography>
          <Typography align="center">{data.outlet_name}</Typography>
          <Typography align="center" variant="caption">Shift #{data.shift_id} · {data.cashier}</Typography>
          <Divider sx={{ my: 1 }} />
          <Row l="Bills" v={data.bill_count} />
          <Row l="Voided" v={data.voided_count} />
          <Row l="Grand total" v={fmt(data.grand_total)} bold />
          <Row l="Returns" v={fmt(data.returns_total)} />
          <Row l="Discount" v={fmt(data.discount_total)} />
          <Row l="Tax" v={fmt(data.tax_total)} />
          <Row l="Expenses" v={fmt(data.expense_total)} />
          <Divider sx={{ my: 1 }} />
          {Object.entries(data.tenders || {}).map(([k, v]) =>
            <Row key={k} l={k.toUpperCase()} v={fmt(v)} />
          )}
          <Divider sx={{ my: 1 }} />
          <Row l="Opening" v={fmt(data.opening_cash)} />
          <Row l="Expected" v={fmt(data.expected_cash)} />
          {data.counted_cash !== null && <Row l="Counted" v={fmt(data.counted_cash)} />}
          {data.cash_variance !== null && <Row l="Variance" v={fmt(data.cash_variance)} bold />}
        </Paper>
      )}
    </Layout>
  );
}

function Row({ l, v, bold }) {
  return (
    <Box sx={{ display: "flex", fontWeight: bold ? 700 : 400 }}>
      <Box sx={{ flex: 1 }}>{l}</Box>
      <Box>{v}</Box>
    </Box>
  );
}
