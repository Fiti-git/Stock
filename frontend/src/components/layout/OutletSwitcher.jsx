import { useState } from "react";
import {
  Box, MenuItem, Select, Typography, Tooltip, InputBase,
  IconButton, Menu, ListItemText,
} from "@mui/material";
import StorefrontIcon from "@mui/icons-material/Storefront";
import CheckIcon from "@mui/icons-material/Check";
import { useOutlet } from "../../contexts/OutletContext";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Outlet picker. Used in two places:
 *   - variant="topbar" — compact pill in the global TopBar (default).
 *   - variant="topbar-compact" — icon-only on small screens, falls back to a
 *     menu of outlets on tap.
 *
 * Behaviour:
 *   - Admins / super-admins: dropdown of all outlets, persisted in
 *     localStorage via OutletContext.
 *   - Non-admins: read-only chip showing their assigned outlet (no dropdown).
 */
export default function OutletSwitcher({ variant = "topbar" }) {
  const { user } = useAuth();
  const { selectedOutlet, setSelectedOutlet, outlets, canSwitchOutlet } = useOutlet();
  const [anchor, setAnchor] = useState(null);

  if (!user) return null;

  const name = selectedOutlet?.name || user.outlet_name || "—";

  // Non-admin → read-only chip.
  if (!canSwitchOutlet) {
    if (variant === "topbar-compact") {
      return (
        <Tooltip title={name}>
          <Box sx={{ display: "inline-flex", alignItems: "center", color: "text.secondary", px: 1 }}>
            <StorefrontIcon fontSize="small" />
          </Box>
        </Tooltip>
      );
    }
    return (
      <Box
        sx={{
          px: 1.25, py: 0.5,
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          borderRadius: 1.5,
          border: "1px solid",
          borderColor: "divider",
          bgcolor: "action.hover",
          maxWidth: 220,
        }}
      >
        <StorefrontIcon fontSize="small" sx={{ color: "text.secondary" }} />
        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
          {name}
        </Typography>
      </Box>
    );
  }

  // Admin → dropdown.
  if (outlets.length === 0) {
    // Outlets still loading — placeholder so layout doesn't shift.
    return variant === "topbar-compact"
      ? null
      : <Box sx={{ height: 36, width: 180 }} />;
  }

  // Compact (mobile) — icon button → menu.
  if (variant === "topbar-compact") {
    return (
      <>
        <Tooltip title={`Outlet: ${name}`}>
          <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)}>
            <StorefrontIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
          {outlets.map((o) => {
            const active = o.id === selectedOutlet?.id;
            return (
              <MenuItem
                key={o.id}
                selected={active}
                onClick={() => {
                  setSelectedOutlet({ id: o.id, name: o.outlet_name });
                  setAnchor(null);
                }}
              >
                <Box sx={{ width: 24, display: "flex", justifyContent: "center", mr: 1 }}>
                  {active && <CheckIcon fontSize="small" color="primary" />}
                </Box>
                <ListItemText primary={o.outlet_name} />
              </MenuItem>
            );
          })}
        </Menu>
      </>
    );
  }

  // Default topbar — full pill select.
  const value = selectedOutlet?.id ?? "";
  return (
    <Select
      size="small"
      value={value}
      onChange={(e) => {
        const found = outlets.find((o) => o.id === Number(e.target.value));
        if (found) setSelectedOutlet({ id: found.id, name: found.outlet_name });
      }}
      input={
        <InputBase
          sx={{
            px: 1.25,
            borderRadius: 1.5,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "action.hover",
            minWidth: 200,
            "& .MuiSelect-select": {
              py: 0.5,
              pl: 0,
              display: "flex",
              alignItems: "center",
              gap: 1,
              fontSize: "0.85rem",
              fontWeight: 600,
            },
          }}
        />
      }
      startAdornment={<StorefrontIcon fontSize="small" sx={{ color: "text.secondary", mr: 0.75 }} />}
    >
      {outlets.map((o) => (
        <MenuItem key={o.id} value={o.id}>
          {o.outlet_name}
        </MenuItem>
      ))}
    </Select>
  );
}
