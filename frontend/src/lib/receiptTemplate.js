/**
 * receiptTemplate.js — pure function that turns a Bill (BillSerializer shape)
 * into an 80mm-thermal-friendly HTML string.
 *
 * The output is self-contained: inline <style>, no external assets, no DOM.
 * Width is fixed to 80mm (~302px at 96dpi) and the layout is monospace so
 * the local printer agent can rasterize it directly.
 *
 * Bill shape (from backend/apps/pos/serializers.py BillSerializer):
 *   bill_no, outlet_name, outlet_address, outlet_phone, outlet_tax_reg,
 *   outlet_receipt_footer, cashier_username, customer_name, customer_phone,
 *   subtotal, bill_discount, tax_total, grand_total, paid_total, change_due,
 *   created_at, closed_at, lines:[{item_code,item_name,qty,unit_price,line_total}],
 *   payments:[{tender, amount}]
 */

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (n) => toNumber(n).toFixed(2);

const escape = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const padRight = (s, n) => {
  const str = String(s ?? "");
  return str.length >= n ? str.slice(0, n) : str + " ".repeat(n - str.length);
};

export function renderReceiptHtml(bill) {
  if (!bill) return "";
  const dt = bill.closed_at || bill.created_at;
  const dateStr = dt ? new Date(dt).toLocaleString() : "";

  const lines = (bill.lines || [])
    .map((l) => {
      const head = `<div class="ln-head">${escape(l.item_code || "")} ${escape(l.item_name || "")}</div>`;
      const detail =
        `<div class="ln-detail"><span>${money(l.qty)} x ${money(l.unit_price)}` +
        `${toNumber(l.line_discount) > 0 ? ` -${money(l.line_discount)}` : ""}</span>` +
        `<span class="right">${money(l.line_total)}</span></div>`;
      return head + detail;
    })
    .join("");

  const payments = (bill.payments || [])
    .map(
      (p) =>
        `<div class="row"><span>${escape((p.tender || "").toUpperCase())}</span>` +
        `<span class="right">${money(p.amount)}</span></div>`
    )
    .join("");

  const customerLine =
    bill.customer_name || bill.customer_phone
      ? `<div class="center">Customer: ${escape(bill.customer_name || "")}${
          bill.customer_phone ? " (" + escape(bill.customer_phone) + ")" : ""
        }</div>`
      : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(bill.bill_no || "Receipt")}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', Consolas, monospace;
    font-size: 12px;
    line-height: 1.3;
    width: 80mm;
    padding: 4mm 3mm;
    color: #000;
  }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: bold; }
  .lg     { font-size: 14px; }
  .sep    { border-top: 1px dashed #000; margin: 4px 0; }
  .row    { display: flex; justify-content: space-between; }
  .ln-head { font-weight: 600; word-break: break-word; }
  .ln-detail { display: flex; justify-content: space-between; padding-left: 6px; }
</style></head><body>
  <div class="center bold lg">${escape(bill.outlet_name || "")}</div>
  ${bill.outlet_address ? `<div class="center">${escape(bill.outlet_address)}</div>` : ""}
  ${bill.outlet_phone ? `<div class="center">Tel: ${escape(bill.outlet_phone)}</div>` : ""}
  ${bill.outlet_tax_reg ? `<div class="center">Tax Reg: ${escape(bill.outlet_tax_reg)}</div>` : ""}
  <div class="sep"></div>
  <div class="row"><span>Bill: ${escape(bill.bill_no || "")}</span><span>${escape(dateStr)}</span></div>
  <div class="row"><span>Cashier: ${escape(bill.cashier_username || "")}</span><span></span></div>
  ${customerLine}
  <div class="sep"></div>
  ${lines || '<div class="center">(no items)</div>'}
  <div class="sep"></div>
  <div class="row"><span>Subtotal</span><span class="right">${money(bill.subtotal)}</span></div>
  ${
    toNumber(bill.bill_discount) > 0
      ? `<div class="row"><span>Discount</span><span class="right">-${money(bill.bill_discount)}</span></div>`
      : ""
  }
  ${
    Array.isArray(bill.tax_breakdown) && bill.tax_breakdown.length > 0
      ? bill.tax_breakdown
          .map(
            (t) =>
              `<div class="row"><span>${escape(t.code || "")} ${escape(
                String(t.rate_pct || "")
              )}%${t.inclusive ? " (incl)" : ""}</span><span class="right">${money(
                t.amount
              )}</span></div>`
          )
          .join("")
      : toNumber(bill.tax_total) > 0
      ? `<div class="row"><span>Tax</span><span class="right">${money(bill.tax_total)}</span></div>`
      : ""
  }
  <div class="row bold lg"><span>TOTAL</span><span class="right">${money(bill.grand_total)}</span></div>
  <div class="sep"></div>
  ${payments}
  <div class="row"><span>Paid</span><span class="right">${money(bill.paid_total)}</span></div>
  ${
    toNumber(bill.change_due) > 0
      ? `<div class="row"><span>Change</span><span class="right">${money(bill.change_due)}</span></div>`
      : ""
  }
  <div class="sep"></div>
  ${
    bill.outlet_receipt_footer
      ? `<div class="center">${escape(bill.outlet_receipt_footer)}</div>`
      : '<div class="center">Thank you!</div>'
  }
  <div class="center" style="margin-top:6px;font-size:10px;">${escape(bill.bill_no || "")} - ${escape(
    bill.cashier_username || ""
  )} - ${escape(dateStr)}</div>
</body></html>`;
}

// Tiny helper exported for the settings page test print.
export function makeDummyBill() {
  return {
    bill_no: "TEST-0001",
    outlet_name: "Arunalu Super Mart",
    outlet_address: "No. 1, Test Lane, Colombo",
    outlet_phone: "+94 11 000 0000",
    outlet_tax_reg: "TAX-TEST-123",
    outlet_receipt_footer: "Thank you for testing!",
    cashier_username: "tester",
    customer_name: "",
    customer_phone: "",
    subtotal: "1000.00",
    bill_discount: "100.00",
    tax_total: "0.00",
    grand_total: "900.00",
    paid_total: "1000.00",
    change_due: "100.00",
    created_at: new Date().toISOString(),
    closed_at: new Date().toISOString(),
    lines: [
      { id: 1, item_code: "TST001", item_name: "Test Item A", qty: "2", unit_price: "300.00", line_discount: "0", line_total: "600.00" },
      { id: 2, item_code: "TST002", item_name: "Test Item B (long name wraps gracefully)", qty: "1", unit_price: "400.00", line_discount: "0", line_total: "400.00" },
    ],
    payments: [{ id: 1, tender: "cash", amount: "1000.00" }],
  };
}
