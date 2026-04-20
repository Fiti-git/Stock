import KeyboardReturnIcon from "@mui/icons-material/KeyboardReturn";
import TransactionUploadPage from "../../components/transactions/TransactionUploadPage";
import { makeTxnApi } from "../../api/txnApi";

const api = makeTxnApi("rts");

export default function RtsUploadPage() {
  return (
    <TransactionUploadPage
      config={{
        label: "Return to Supplier",
        icon: <KeyboardReturnIcon />,
        api,
        historyPath: "/transactions/rts/history",
      }}
    />
  );
}
