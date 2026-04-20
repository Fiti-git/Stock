import FactCheckIcon from "@mui/icons-material/FactCheck";
import TransactionHistoryPage from "../../components/transactions/TransactionHistoryPage";
import { makeTxnApi } from "../../api/txnApi";

const api = makeTxnApi("verification");

export default function VerificationHistoryPage() {
  return (
    <TransactionHistoryPage
      config={{
        label: "Verification",
        icon: <FactCheckIcon />,
        api,
        uploadPath: "/transactions/verification/upload",
      }}
    />
  );
}
