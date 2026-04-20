import AssignmentIcon from "@mui/icons-material/Assignment";
import TransactionHistoryPage from "../../components/transactions/TransactionHistoryPage";
import { makeTxnApi } from "../../api/txnApi";

const api = makeTxnApi("office");

export default function OfficeHistoryPage() {
  return (
    <TransactionHistoryPage
      config={{
        label: "Office Use",
        icon: <AssignmentIcon />,
        api,
        uploadPath: "/transactions/office/upload",
      }}
    />
  );
}
