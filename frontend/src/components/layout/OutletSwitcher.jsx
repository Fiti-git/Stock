import {
  Box, MenuItem, Select, Typography, Tooltip, InputBase,
} from "@mui/material";
import StorefrontIcon from "@mui/icons-material/Storefront";
import { useOutlet } from "../../contexts/OutletContext";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Outlet picker rendered in the sidebar (and reusable in TopBar).
 *
 * Behaviour:
 *   - Admins / super-admins: dropdown of all outlets, persisted in
 *     localStorage via OutletContext.
 *   - Non-admins: read-only chip showing their assigned outlet (no dropdown).
 *   - When the sidebar is collapsed to its icon-rail, this collapses to a
 *     tooltip-wrapped icon — no flyout (a Select inside a tiny rail looks
 *     terrible).
 *
 * `variant`:
 *   - "sidebar" (default) — full-width pill, matches sidebar styling.
 *   - "topbar" — compact inline select used inside the TopBar.
 */
export default function OutletSwitcher({ variant = "sidebar", collapsed = false }) {
  const { user } = useAuth();
  const { selectedOutlet, setSelectedOutlet, outlets, canSwitchOutlet } = useOutlet();

  if (!user) return null;

  // Collapsed-rail mode: just an icon with a tooltip. No interaction.
  if (collapsed) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
        <Tooltip
          title={selectedOutlet?.name || user.outlet_name || "No outlet"}
          placement="right"
        >
          <StorefrontIcon fontSize="small" sx={{ color: "text.secondary" }} />
        </Tooltip>
      </Box>
    );
  }

  // Non-admin → read-only chip.
  if (!canSwitchOutlet) {
    const name = user.outlet_name || selectedOutlet?.name || "—";
    return (
      <Box
        sx={{
          mx: variant === "sidebar" ? 2 : 0,
          px: 1.25,
          py: 0.75,
          display: "flex",
          alignItems: "center",
          gap: 1,
          borderRadius: 1.5,
          bgcolor: "background.neutral",
          border: "1px solid",
          borderColor: "divider",
          minWidth: 0,
        }}
      >
        <StorefrontIcon fontSize="small" sx={{ color: "text.secondary" }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{ display: "block", color: "text.secondary", lineHeight: 1, fontSize: "0.62rem", letterSpacing: "0.06em" }}
          >
            OUTLET
          </Typography>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {name}
          </Typography>
        </Box>
      </Box>
    );
  }

  // Admin → dropdown.
  if (outlets.length === 0) {
    // Outlets still loading (or none configured) — render a placeholder so
    // the sidebar layout doesn't shift when they arrive.
    return (
      <Box sx={{ mx: variant === "sidebar" ? 2 : 0, height: 40 }} />
    );
  }

  const value = selectedOutlet?.id ?? "";

  return (
    <Box sx={{ mx: variant === "sidebar" ? 2 : 0 }}>
      <Select
        size="small"
        fullWidth={variant === "sidebar"}
        value={value}
        onChange={(e) => {
          const found = outlets.find((o) => o.id === Number(e.target.value));
          if (found) setSelectedOutlet({ id: found.id, name: found.outlet_name });
        }}
        input={
          <InputBase
            sx={{
              px: 1.25,
              py: 0.25,
              borderRadius: 1.5,
              bgcolor: "background.neutral",
              border: "1px solid",
              borderColor: "divider",
              "& .MuiSelect-select": {
                pl: 0,
                py: 0.5,
                display: "flex",
                alignItems: "center",
                gap: 1,
                fontSize: "0.85rem",
                fontWeight: 600,
              },
            }}
          />
        }
        startAdornment={<StorefrontIcon fontSize="small" sx={{ color: "text.secondary", mr: 0.5 }} />}
      >
        {outlets.map((o) => (
          <MenuItem key={o.id} value={o.id}>
            {o.outlet_name}
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
}
