import MoveToInboxIcon from "@mui/icons-material/MoveToInbox";
import TransactionHistoryPage from "../../components/transactions/TransactionHistoryPage";
import { makeTxnApi } from "../../api/txnApi";

const api = makeTxnApi("grn");

// GRN rows carry supplier/invoice/tax columns in addition to the standard
// transaction fields — expose them in the batch-detail dialog.
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

export default function GrnHistoryPage() {
  return (
    <TransactionHistoryPage
      config={{
        label: "GRN (Goods Received)",
        icon: <MoveToInboxIcon />,
        api,
        uploadPath: "/transactions/grn/upload",
        detailColumns: DETAIL_COLUMNS,
      }}
    />
  );
}
