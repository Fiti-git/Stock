import MoveToInboxIcon from "@mui/icons-material/MoveToInbox";
import TransactionUploadPage from "../../components/transactions/TransactionUploadPage";
import { makeTxnApi } from "../../api/txnApi";

const api = makeTxnApi("grn");

export default function GrnUploadPage() {
  return (
    <TransactionUploadPage
      config={{
        label: "GRN (Goods Received)",
        icon: <MoveToInboxIcon />,
        api,
        historyPath: "/transactions/grn/history",
      }}
    />
  );
}
