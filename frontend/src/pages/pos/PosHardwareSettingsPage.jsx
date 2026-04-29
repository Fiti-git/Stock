import { useState } from "react";
import {
  Box, Paper, Stack, TextField, Button, Typography, FormControlLabel,
  Checkbox, Alert,
} from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import HardwareStatusChip from "../../components/HardwareStatusChip";
import {
  getHardwareConfig, setHardwareConfig,
  printReceipt, openCashDrawer, probeAgent,
} from "../../lib/hardware";
import { makeDummyBill } from "../../lib/receiptTemplate";
import { useNotification } from "../../providers/NotificationProvider";

export default function PosHardwareSettingsPage() {
  const { notify } = useNotification();
  const initial = getHardwareConfig();
  const [agentUrl, setAgentUrl] = useState(initial.agentUrl);
  const [fallback, setFallback] = useState(initial.fallbackToBrowserPrint);
  const [busy, setBusy] = useState(false);

  const save = () => {
    const next = setHardwareConfig({ agentUrl, fallbackToBrowserPrint: fallback });
    setAgentUrl(next.agentUrl);
    notify("Hardware settings saved.", "success");
  };

  const testProbe = async () => {
    setBusy(true);
    try {
      const r = await probeAgent();
      notify(
        r.available
          ? `Agent reachable${r.version ? ` (v${r.version})` : ""}.`
          : "Agent unreachable.",
        r.available ? "success" : "warning",
      );
    } finally { setBusy(false); }
  };

  const testPrint = async () => {
    setBusy(true);
    try {
      const ok = await printReceipt(makeDummyBill());
      notify(ok ? "Test print sent." : "Test print failed.", ok ? "success" : "error");
    } finally { setBusy(false); }
  };

  const testDrawer = async () => {
    setBusy(true);
    try {
      const ok = await openCashDrawer();
      notify(ok ? "Drawer kick sent." : "Drawer kick failed (agent unreachable).", ok ? "success" : "warning");
    } finally { setBusy(false); }
  };

  return (
    <Layout>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <PageHeader
          title="POS Hardware"
          subtitle="Local printer / cash-drawer / customer-display agent"
          icon={<PointOfSaleIcon />}
        />
        <HardwareStatusChip />
      </Stack>

      <Paper sx={{ p: 3, mt: 2, maxWidth: 720 }}>
        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
          Local agent
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The POS terminal sends print and drawer commands to a small HTTP agent
          running on this till PC. Default URL is{" "}
          <code>http://127.0.0.1:9100</code>.
        </Typography>

        <Stack spacing={2}>
          <TextField
            label="Agent URL"
            value={agentUrl}
            onChange={(e) => setAgentUrl(e.target.value)}
            placeholder="http://127.0.0.1:9100"
            fullWidth
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={fallback}
                onChange={(e) => setFallback(e.target.checked)}
              />
            }
            label="Fall back to browser print if the agent is unavailable"
          />

          <Box>
            <Button variant="contained" onClick={save}>Save</Button>
          </Box>

          <Alert severity="info">
            Use the buttons below to verify the till's hardware is wired up.
            Test print uses a synthetic dummy bill.
          </Alert>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button variant="outlined" onClick={testProbe} disabled={busy}>
              Probe agent
            </Button>
            <Button variant="outlined" startIcon={<PrintIcon />} onClick={testPrint} disabled={busy}>
              Test print
            </Button>
            <Button variant="outlined" onClick={testDrawer} disabled={busy}>
              Test drawer
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Layout>
  );
}
