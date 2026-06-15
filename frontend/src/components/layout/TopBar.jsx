import { useState } from "react";
import {
  AppBar, Toolbar, IconButton, Box, Button, Tooltip,
  Avatar, Menu, MenuItem as MuiMenuItem, Divider, ListItemIcon, Typography, useTheme, useMediaQuery,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import { useAuth } from "../../contexts/AuthContext";
import { useSystem } from "../../contexts/SystemContext";
import Breadcrumbs from "./Breadcrumbs";
import OutletSwitcher from "./OutletSwitcher";
import AppSwitcher from "./AppSwitcher";

export default function TopBar({ onMenuClick, onOpenPalette }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const isSmall = useMediaQuery(theme.breakpoints.down("sm"));
  const { user, logout } = useAuth();
  const { activeSystem } = useSystem();
  const [anchor, setAnchor] = useState(null);

  // Outlet context is meaningful only in the Stock app; org-wide and admin
  // pages don't operate against a single outlet.
  const showOutlet = activeSystem === "stock";

  const initials = (user?.username || "?").slice(0, 2).toUpperCase();

  return (
    <AppBar
      position="sticky"
      color="inherit"
      elevation={0}
      sx={{
        bgcolor: "background.paper",
        borderBottom: "1px solid",
        borderColor: "divider",
        zIndex: (t) => t.zIndex.drawer - 1,
      }}
    >
      <Toolbar sx={{ gap: 1.25, minHeight: { xs: 56, md: 64 } }}>
        {isMobile && (
          <IconButton edge="start" onClick={onMenuClick}>
            <MenuIcon />
          </IconButton>
        )}

        {!isMobile && <Breadcrumbs />}

        <Box sx={{ flex: 1 }} />

        {/* Global context: outlet + app switchers. Outlet hidden in Org / Admin. */}
        {showOutlet && (
          <Box sx={{ display: { xs: "none", md: "inline-flex" } }}>
            <OutletSwitcher variant="topbar" />
          </Box>
        )}
        {showOutlet && (
          <Box sx={{ display: { xs: "inline-flex", md: "none" } }}>
            <OutletSwitcher variant="topbar-compact" />
          </Box>
        )}

        <Box sx={{ display: { xs: "none", md: "inline-flex" } }}>
          <AppSwitcher />
        </Box>
        <Box sx={{ display: { xs: "inline-flex", md: "none" } }}>
          <AppSwitcher compact />
        </Box>

        <Tooltip title="Search (Ctrl/⌘ + K)">
          <Button
            onClick={onOpenPalette}
            variant="outlined"
            color="inherit"
            startIcon={<SearchIcon fontSize="small" />}
            size="small"
            sx={{
              display: { xs: "none", lg: "inline-flex" },
              color: "text.secondary",
              borderColor: "divider",
              textTransform: "none",
              fontWeight: 400,
              minWidth: 200,
              justifyContent: "flex-start",
              bgcolor: "action.hover",
              "&:hover": { bgcolor: "action.hover", borderColor: "divider" },
            }}
          >
            <Box sx={{ flex: 1, textAlign: "left" }}>Search…</Box>
            <Box
              component="kbd"
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                px: 0.75,
                fontSize: "0.7rem",
                fontFamily: "inherit",
                color: "text.secondary",
              }}
            >
              ⌘K
            </Box>
          </Button>
        </Tooltip>

        <IconButton onClick={onOpenPalette} sx={{ display: { xs: "inline-flex", lg: "none" } }}>
          <SearchIcon />
        </IconButton>

        <Tooltip title={user?.username || "Account"}>
          <IconButton onClick={(e) => setAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
            <Avatar sx={{ width: 34, height: 34, bgcolor: "primary.main", fontSize: "0.85rem", fontWeight: 600 }}>
              {initials}
            </Avatar>
          </IconButton>
        </Tooltip>
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="subtitle2" noWrap>{user?.username}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "capitalize" }}>
              {user?.role} {user?.outlet_name ? `· ${user.outlet_name}` : ""}
            </Typography>
          </Box>
          <Divider />
          <MuiMenuItem disabled>
            <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
            Profile
          </MuiMenuItem>
          <Divider />
          <MuiMenuItem onClick={logout}>
            <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
            Logout
          </MuiMenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
