import AssignmentReturnIcon from "@mui/icons-material/AssignmentReturn";
import TransactionUploadPage from "../../components/transactions/TransactionUploadPage";
import { makeTxnApi } from "../../api/txnApi";

const api = makeTxnApi("sales_returns");

export default function SalesReturnsUploadPage() {
  return (
    <TransactionUploadPage
      config={{
        label: "Sales Returns",
        icon: <AssignmentReturnIcon />,
        api,
        historyPath: "/transactions/sales_returns/history",
      }}
    />
  );
}
