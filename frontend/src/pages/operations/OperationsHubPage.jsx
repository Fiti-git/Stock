import { Grid } from "@mui/material";
import DashboardCustomizeIcon from "@mui/icons-material/DashboardCustomize";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import StoreIcon from "@mui/icons-material/Store";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import Layout from "../../components/Layout";
import { PageHeader, HubCard } from "../../components/ui";
import { useAuth } from "../../contexts/AuthContext";

const REPORTS = [
  {
    key: "today",
    title: "Operations — Today",
    description: "Per-outlet upload coverage across every report type. Red means something's missing.",
    icon: DashboardCustomizeIcon,
    accent: "primary",
    to: "/operations/today",
  },
  {
    key: "daily_sales",
    title: "Daily Sales Summary",
    description: "Bills, gross, discount, returns, net sales, and average bill value per outlet per day.",
    icon: PointOfSaleIcon,
    accent: "info",
    to: "/operations/reports/daily-sales",
  },
  {
    key: "item_rankings",
    title: "Top Sellers / Dead Stock",
    description: "Best and worst selling items by revenue, qty, or margin. Includes items bought but never sold.",
    icon: LeaderboardIcon,
    accent: "warning",
    to: "/operations/reports/item-rankings",
  },
  {
    key: "wastage",
    title: "Wastage Summary",
    description: "Damage + office + verification losses per outlet. Flags outlets where wastage > 3% of purchases.",
    icon: DeleteSweepIcon,
    accent: "error",
    to: "/operations/reports/wastage",
  },
  {
    key: "anomalies",
    title: "Anomaly Dashboard",
    description: "Sales drops, damage spikes, return spikes, high-discount cashiers, wastage outliers.",
    icon: WarningAmberIcon,
    accent: "secondary",
    to: "/operations/anomalies",
  },
  {
    key: "supplier_scorecard",
    title: "Supplier Scorecard",
    description: "LKR bought per supplier, RTS rate %, avg delivery size, price drift, last delivery.",
    icon: LocalShippingIcon,
    accent: "success",
    to: "/operations/supplier-scorecard",
  },
];

export default function OperationsHubPage() {
  const { user } = useAuth();
  return (
    <Layout>
      <PageHeader
        title="Outlet Operations"
        subtitle={`${user?.username ?? ""} · Super-admin monitoring and reports across every outlet.`}
        icon={<StoreIcon />}
      />
      <Grid container spacing={2.5}>
        {REPORTS.map((r) => (
          <Grid key={r.key} item xs={12} sm={6} md={4}>
            <HubCard
              to={r.to}
              icon={r.icon}
              title={r.title}
              accent={r.accent}
              description={r.description}
              buttonLabel="Open report"
            />
          </Grid>
        ))}
      </Grid>
    </Layout>
  );
}
