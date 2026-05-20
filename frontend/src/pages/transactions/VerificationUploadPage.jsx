import FactCheckIcon from "@mui/icons-material/FactCheck";
import TransactionUploadPage from "../../components/transactions/TransactionUploadPage";
import { makeTxnApi } from "../../api/txnApi";

const api = makeTxnApi("verification");

export default function VerificationUploadPage() {
  return (
    <TransactionUploadPage
      config={{
        label: "Verification",
        icon: <FactCheckIcon />,
        api,
        historyPath: "/uploaded-sheets?pipeline=verification",
      }}
    />
  );
}
