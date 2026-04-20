import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import TransactionHistoryPage from "../../components/transactions/TransactionHistoryPage";
import { makeTxnApi } from "../../api/txnApi";

const api = makeTxnApi("sales");

const DETAIL_COLUMNS = [
  { header: "Invoice",     field: "invoice_no" },
  { header: "Date",        field: "txn_date" },
  { header: "Time",        field: "txn_time" },
  { header: "Code",        field: "item_code" },
  { header: "Description", field: "description" },
  { header: "Cost",        field: "cost_price",  format: (v) => v ?? "—" },
  { header: "Unit Price",  field: "unit_price",  format: (v) => v ?? "—" },
  { header: "Qty",         field: "qty" },
  { header: "Discount",    field: "discount" },
  { header: "Amount",      field: "amount",      format: (v) => Number(v).toLocaleString() },
  { header: "Cashier",     field: "cashier" },
];

export default function SalesHistoryPage() {
  return (
    <TransactionHistoryPage
      config={{
        label: "Sales (Bill Listing)",
        icon: <PointOfSaleIcon />,
        api,
        uploadPath: "/transactions/sales/upload",
        detailColumns: DETAIL_COLUMNS,
      }}
    />
  );
}
