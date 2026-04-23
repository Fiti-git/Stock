import { useState, useEffect } from "react";
import { Stack, Button, Typography, Chip } from "@mui/material";
import WarningIcon from "@mui/icons-material/Warning";
import RefreshIcon from "@mui/icons-material/Refresh";
import Layout from "../../components/Layout";
import { PageHeader, DataTable } from "../../components/ui";
import { getLowStock } from "../../api/pos";

export default function PosLowStockPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try { const r = await getLowStock(); setRows(r.data.results || []); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const cols = [
    { field: "item_code", headerName: "Code", flex: 0.6, minWidth: 100 },
    { field: "item_name", headerName: "Name", flex: 1.4, minWidth: 200 },
    { field: "category", headerName: "Category", flex: 0.8, minWidth: 110, valueGetter: (v) => v || "—" },
    { field: "on_hand", headerName: "On Hand", flex: 0.5, minWidth: 80, valueGetter: (v) => Number(v).toFixed(3).replace(/\.?0+$/, "") },
    { field: "reorder_level", headerName: "Reorder At", flex: 0.5, minWidth: 80, valueGetter: (v) => Number(v).toFixed(3).replace(/\.?0+$/, "") },
    { field: "shortfall", headerName: "Short By", flex: 0.5, minWidth: 80,
      renderCell: (p) => <Chip size="small" color="error" label={Number(p.value).toFixed(3).replace(/\.?0+$/, "")} /> },
    { field: "cost_price", headerName: "Cost", flex: 0.5, minWidth: 80, valueGetter: (v) => Number(v).toFixed(2) },
  ];
  return (
    <Layout>
      <PageHeader title="Low Stock" subtitle="Items below reorder level" icon={<WarningIcon />} />
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>{rows.length} item{rows.length !== 1 ? "s" : ""} need restocking</Typography>
      </Stack>
      <DataTable rows={rows} columns={cols} loading={loading} getRowId={(r) => r.id} height={600} emptyText="All stock above reorder level" />
    </Layout>
  );
}
