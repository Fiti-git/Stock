import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import TransactionUploadPage from "../../components/transactions/TransactionUploadPage";
import { makeTxnApi } from "../../api/txnApi";

const api = makeTxnApi("sales");

export default function SalesUploadPage() {
  return (
    <TransactionUploadPage
      config={{
        label: "Sales (Bill Listing)",
        icon: <PointOfSaleIcon />,
        api,
        historyPath: "/uploaded-sheets?pipeline=sales",
      }}
    />
  );
}
