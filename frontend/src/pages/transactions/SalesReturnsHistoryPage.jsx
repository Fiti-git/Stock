import AssignmentReturnIcon from "@mui/icons-material/AssignmentReturn";
import TransactionHistoryPage from "../../components/transactions/TransactionHistoryPage";
import { makeTxnApi } from "../../api/txnApi";

const api = makeTxnApi("sales_returns");

const DETAIL_COLUMNS = [
  { header: "Invoice",     field: "invoice_no" },
  { header: "Date",        field: "txn_date" },
  { header: "Time",        field: "txn_time" },
  { header: "Code",        field: "item_code" },
  { header: "Barcode",     field: "barcode" },
  { header: "Description", field: "description" },
  { header: "Qty",         field: "qty" },
  { header: "Cost",        field: "cost_price",    format: (v) => v ?? "—" },
  { header: "Gross",       field: "gross_value",   format: (v) => Number(v).toLocaleString() },
  { header: "Reason",      field: "remarks" },
  { header: "User",        field: "user_name" },
];

export default function SalesReturnsHistoryPage() {
  return (
    <TransactionHistoryPage
      config={{
        label: "Sales Returns",
        icon: <AssignmentReturnIcon />,
        api,
        uploadPath: "/transactions/sales_returns/upload",
        detailColumns: DETAIL_COLUMNS,
      }}
    />
  );
}
