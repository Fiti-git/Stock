import { useState, useEffect } from "react";
import { Paper, Typography, Stack, Box, Chip, Button } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import { Link as RouterLink } from "react-router-dom";
import { listProducts, getMyOpenShift, getOutletSettings } from "../api/pos";
import { useOutlet } from "../contexts/OutletContext";

/**
 * Shown on admin / manager dashboards when the outlet is new.
 * Auto-hides once all steps are complete. Refreshes on mount.
 */
export default function OnboardingChecklist() {
  const { outletId } = useOutlet();
  const [state, setState] = useState(null);

  useEffect(() => {
    if (!outletId) return;
    (async () => {
      try {
        const [prod, shift, settings] = await Promise.all([
          listProducts({ page: 1, page_size: 1 }).catch(() => ({ data: { count: 0 } })),
          getMyOpenShift().catch(() => ({ data: null })),
          getOutletSettings(outletId).catch(() => ({ data: {} })),
        ]);
        setState({
          hasProducts: (prod.data.count || 0) > 0,
          hasShift: !!shift.data,
          hasReceiptInfo: !!(settings.data?.address || settings.data?.phone),
        });
      } catch { /**/ }
    })();
  }, [outletId]);

  if (!state) return null;
  const steps = [
    { key: "products", label: "Add your products", done: state.hasProducts, to: "/pos/products", hint: "Import a CSV or add one by one" },
    { key: "outlet", label: "Fill receipt header", done: state.hasReceiptInfo, to: "/pos/outlet-settings", hint: "Address, phone, tax reg, LankaQR" },
    { key: "shift", label: "Open a shift & sell", done: state.hasShift, to: "/terminal", hint: "Go to Terminal" },
  ];
  const allDone = steps.every((s) => s.done);
  if (allDone) return null;

  return (
    <Paper sx={{ p: 3, mb: 3, bgcolor: "primary.main", color: "primary.contrastText" }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <RocketLaunchIcon />
        <Typography variant="h6" fontWeight={700}>Get started in 3 steps</Typography>
      </Stack>
      <Stack spacing={1.5}>
        {steps.map((s) => (
          <Stack key={s.key} direction="row" alignItems="center" spacing={1.5}
            component={RouterLink} to={s.to}
            sx={{ textDecoration: "none", color: "inherit", p: 1.5, borderRadius: 1,
                  bgcolor: "rgba(255,255,255,0.15)", "&:hover": { bgcolor: "rgba(255,255,255,0.25)" } }}>
            {s.done ? <CheckCircleIcon /> : <RadioButtonUncheckedIcon />}
            <Box sx={{ flex: 1 }}>
              <Typography fontWeight={600}>{s.label}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>{s.hint}</Typography>
            </Box>
            {s.done ? <Chip label="Done" size="small" color="success" /> : <Button size="small" variant="contained" color="secondary">Go</Button>}
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}
