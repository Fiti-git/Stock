import BrokenImageIcon from "@mui/icons-material/BrokenImage";
import TransactionHistoryPage from "../../components/transactions/TransactionHistoryPage";
import { makeTxnApi } from "../../api/txnApi";

const api = makeTxnApi("damage");

export default function DamageHistoryPage() {
  return (
    <TransactionHistoryPage
      config={{
        label: "Damage / Wastage",
        icon: <BrokenImageIcon />,
        api,
        uploadPath: "/transactions/damage/upload",
      }}
    />
  );
}
