import KeyboardReturnIcon from "@mui/icons-material/KeyboardReturn";
import TransactionHistoryPage from "../../components/transactions/TransactionHistoryPage";
import { makeTxnApi } from "../../api/txnApi";

const api = makeTxnApi("rts");

const DETAIL_COLUMNS = [
  { header: "DO#",         field: "do_no" },
  { header: "Supplier",    field: "supplier_code" },
  { header: "Invoice",     field: "invoice_no" },
  { header: "Date",        field: "txn_date" },
  { header: "Code",        field: "item_code" },
  { header: "Description", field: "description" },
  { header: "Cost",        field: "cost_price",    format: (v) => v ?? "—" },
  { header: "Sell",        field: "selling_price", format: (v) => v ?? "—" },
  { header: "Qty",         field: "qty" },
  { header: "Amount",      field: "amount",        format: (v) => Number(v).toLocaleString() },
  { header: "Tax %",       field: "tax_pct" },
  { header: "Tax Amt",     field: "tax_amount",    format: (v) => Number(v).toLocaleString() },
  { header: "User",        field: "user_name" },
];

export default function RtsHistoryPage() {
  return (
    <TransactionHistoryPage
      config={{
        label: "Return to Supplier",
        icon: <KeyboardReturnIcon />,
        api,
        uploadPath: "/transactions/rts/upload",
        detailColumns: DETAIL_COLUMNS,
      }}
    />
  );
}
