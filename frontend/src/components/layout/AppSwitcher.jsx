import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Button, IconButton, Menu, MenuItem, ListItemIcon, ListItemText,
  Typography, Divider, Tooltip,
} from "@mui/material";
import AppsIcon from "@mui/icons-material/Apps";
import InventoryIcon from "@mui/icons-material/Inventory2";
import HubIcon from "@mui/icons-material/Hub";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import CheckIcon from "@mui/icons-material/Check";
import { useAuth } from "../../contexts/AuthContext";
import { useSystem } from "../../contexts/SystemContext";
import { defaultPathForSystem } from "../../routes/config";

const APPS = {
  stock: { label: "Stock",        icon: InventoryIcon,         accent: "#22c55e" },
  org:   { label: "Organization", icon: HubIcon,                accent: "#6366f1" },
  admin: { label: "Admin",        icon: AdminPanelSettingsIcon, accent: "#f59e0b" },
};

/**
 * App switcher in the TopBar. Replaces the old "Switch app" sidebar button.
 * - Single-app users: nothing rendered (no point switching).
 * - Multi-app users: button shows current app; menu lets them jump.
 *
 * `compact=true` collapses to an icon-only button for mobile.
 */
export default function AppSwitcher({ compact = false }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeSystem, setActiveSystem, systems } = useSystem();
  const [anchor, setAnchor] = useState(null);

  if (!user || systems.length <= 1 || !activeSystem) return null;

  const current = APPS[activeSystem];
  const CurrentIcon = current?.icon || AppsIcon;

  const handlePick = (sys) => {
    setAnchor(null);
    if (sys === activeSystem) return;
    setActiveSystem(sys);
    navigate(defaultPathForSystem(sys, user), { replace: true });
  };

  return (
    <>
      {compact ? (
        <Tooltip title={`App: ${current?.label || activeSystem}`}>
          <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)}>
            <AppsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : (
        <Button
          onClick={(e) => setAnchor(e.currentTarget)}
          variant="outlined"
          color="inherit"
          size="small"
          startIcon={<CurrentIcon sx={{ fontSize: 18, color: current?.accent }} />}
          endIcon={<AppsIcon sx={{ fontSize: 16, opacity: 0.7 }} />}
          sx={{
            textTransform: "none",
            fontWeight: 600,
            borderColor: "divider",
            color: "text.primary",
            bgcolor: "action.hover",
            "&:hover": { bgcolor: "action.hover", borderColor: "divider" },
          }}
        >
          {current?.label || activeSystem}
        </Button>
      )}
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <Box sx={{ px: 2, py: 0.5 }}>
          <Typography variant="caption" sx={{ color: "text.secondary", letterSpacing: "0.12em", fontWeight: 700 }}>
            SWITCH APP
          </Typography>
        </Box>
        {systems.map((sys) => {
          const meta = APPS[sys];
          if (!meta) return null;
          const Icon = meta.icon;
          const active = sys === activeSystem;
          return (
            <MenuItem key={sys} selected={active} onClick={() => handlePick(sys)} sx={{ py: 1, minWidth: 220 }}>
              <ListItemIcon>
                <Icon fontSize="small" sx={{ color: meta.accent }} />
              </ListItemIcon>
              <ListItemText primary={meta.label} primaryTypographyProps={{ fontWeight: active ? 700 : 500 }} />
              {active && <CheckIcon fontSize="small" color="primary" sx={{ ml: 1 }} />}
            </MenuItem>
          );
        })}
        <Divider />
        <MenuItem onClick={() => { setAnchor(null); navigate("/select-app"); }} sx={{ py: 1 }}>
          <ListItemIcon><AppsIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Open launcher"
            primaryTypographyProps={{ fontSize: "0.85rem", color: "text.secondary" }}
          />
        </MenuItem>
      </Menu>
    </>
  );
}
