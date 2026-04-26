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
import Breadcrumbs from "./Breadcrumbs";

export default function TopBar({ onMenuClick, onOpenPalette }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { user, logout } = useAuth();
  const [anchor, setAnchor] = useState(null);
  // Outlet selector now lives pinned in the Sidebar — no duplicate here.

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
      <Toolbar sx={{ gap: 1.5, minHeight: { xs: 56, md: 64 } }}>
        {isMobile && (
          <IconButton edge="start" onClick={onMenuClick}>
            <MenuIcon />
          </IconButton>
        )}

        {!isMobile && <Breadcrumbs />}

        <Box sx={{ flex: 1 }} />

        <Tooltip title="Search (Ctrl/⌘ + K)">
          <Button
            onClick={onOpenPalette}
            variant="outlined"
            color="inherit"
            startIcon={<SearchIcon fontSize="small" />}
            size="small"
            sx={{
              display: { xs: "none", sm: "inline-flex" },
              color: "text.secondary",
              borderColor: "divider",
              textTransform: "none",
              fontWeight: 400,
              minWidth: 220,
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

        <IconButton onClick={onOpenPalette} sx={{ display: { xs: "inline-flex", sm: "none" } }}>
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
