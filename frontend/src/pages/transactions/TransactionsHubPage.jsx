import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Grid, Button, Alert, Stack, Box } from "@mui/material";
import BrokenImageIcon from "@mui/icons-material/BrokenImage";
import AssignmentIcon from "@mui/icons-material/Assignment";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import MoveToInboxIcon from "@mui/icons-material/MoveToInbox";
import KeyboardReturnIcon from "@mui/icons-material/KeyboardReturn";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import AssignmentReturnIcon from "@mui/icons-material/AssignmentReturn";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import HistoryIcon from "@mui/icons-material/History";
import Layout from "../../components/Layout";
import { PageHeader, HubCard, LoadingState } from "../../components/ui";
import { useAuth } from "../../contexts/AuthContext";
import { makeTxnApi } from "../../api/txnApi";

const TYPES = [
  { key: "damage",        title: "Damage / Wastage",     description: "Damaged or wasted items written off POS inventory.",  icon: BrokenImageIcon,       accent: "error"     },
  { key: "office",        title: "Office Use",           description: "Stock consumed for internal office use.",              icon: AssignmentIcon,        accent: "secondary" },
  { key: "verification",  title: "Verification",         description: "Stock verifications and adjustments.",                 icon: FactCheckOutlinedIcon, accent: "info"      },
  { key: "grn",           title: "GRN (Goods Received)", description: "Supplier deliveries logged by the POS.",               icon: MoveToInboxIcon,       accent: "success"   },
  { key: "rts",           title: "Return to Supplier",   description: "Items returned to suppliers.",                         icon: KeyboardReturnIcon,    accent: "warning"   },
  { key: "sales",         title: "Sales (Bill Listing)", description: "Every sold line item from POS bills.",                 icon: PointOfSaleIcon,       accent: "primary"   },
  { key: "sales_returns", title: "Sales Returns",        description: "Items returned by customers with reasons.",            icon: AssignmentReturnIcon,  accent: "secondary" },
];

function TypeCard({ type }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    makeTxnApi(type.key).getStats()
      .then(({ data }) => setStats(data))
      .catch(() => setStats({ error: true }))
      .finally(() => setLoading(false));
  }, [type.key]);

  const latest = stats?.latest;
  const pending = stats?.pending_count ?? 0;
  const total = stats?.total_batches ?? 0;
  const gaps = stats?.missing_dates_count ?? 0;

  const chips = [];
  if (!loading && !stats?.error) {
    chips.push({ label: `${total} batch${total === 1 ? "" : "es"}`, variant: "outlined" });
    if (latest) {
      chips.push({
        label: `Last: ${latest.date_from === latest.date_to ? latest.date_from : `${latest.date_from}..${latest.date_to}`}`,
        variant: "outlined",
      });
    } else {
      chips.push({ label: "No uploads yet", variant: "outlined" });
    }
    if (pending > 0) chips.push({ label: `${pending} pending`, color: "warning" });
    if (gaps > 0)    chips.push({ label: `${gaps} gap${gaps === 1 ? "" : "s"}`, color: "info", variant: "outlined" });
  }

  return (
    <HubCard
      icon={type.icon}
      title={type.title}
      accent={type.accent}
      description={type.description}
      chips={chips}
      primaryAction={
        <Button
          fullWidth
          variant="contained"
          color={type.accent}
          startIcon={<UploadFileIcon />}
          component={RouterLink}
          to={`/transactions/${type.key}/upload`}
        >
          Upload
        </Button>
      }
      secondaryAction={
        <Button
          fullWidth
          variant="outlined"
          color={type.accent}
          startIcon={<HistoryIcon />}
          component={RouterLink}
          to={`/transactions/${type.key}/history`}
        >
          History
        </Button>
      }
    >
      {loading && (
        <Box sx={{ mt: 1 }}><LoadingState message="" size={18} sx={{ p: 1 }} /></Box>
      )}
      {stats?.error && (
        <Alert severity="warning" variant="outlined" sx={{ py: 0, mt: 1 }}>
          Could not load summary.
        </Alert>
      )}
    </HubCard>
  );
}

export default function TransactionsHubPage() {
  const { user } = useAuth();
  return (
    <Layout>
      <PageHeader
        title="Transactions"
        subtitle={`${user?.username ?? ""} · Pick a report type to upload or review history.`}
        icon={<ReceiptLongIcon />}
      />
      <Grid container spacing={2.5}>
        {TYPES.map((t) => (
          <Grid key={t.key} item xs={12} sm={6} md={4}>
            <TypeCard type={t} />
          </Grid>
        ))}
      </Grid>
    </Layout>
  );
}
