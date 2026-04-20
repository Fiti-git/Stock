import AssignmentIcon from "@mui/icons-material/Assignment";
import TransactionUploadPage from "../../components/transactions/TransactionUploadPage";
import { makeTxnApi } from "../../api/txnApi";

const api = makeTxnApi("office");

export default function OfficeUploadPage() {
  return (
    <TransactionUploadPage
      config={{
        label: "Office Use",
        icon: <AssignmentIcon />,
        api,
        historyPath: "/transactions/office/history",
      }}
    />
  );
}
