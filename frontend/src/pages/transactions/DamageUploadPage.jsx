import BrokenImageIcon from "@mui/icons-material/BrokenImage";
import TransactionUploadPage from "../../components/transactions/TransactionUploadPage";
import { makeTxnApi } from "../../api/txnApi";

const api = makeTxnApi("damage");

export default function DamageUploadPage() {
  return (
    <TransactionUploadPage
      config={{
        label: "Damage / Wastage",
        icon: <BrokenImageIcon />,
        api,
        historyPath: "/uploaded-sheets?pipeline=damage",
      }}
    />
  );
}
