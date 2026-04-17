import { useEffect, useState } from "react";
import {
  AppBar, Toolbar, IconButton, Box, Button, Tooltip, Select, MenuItem,
  InputBase, Avatar, Menu, MenuItem as MuiMenuItem, Divider, ListItemIcon, Typography, useTheme, useMediaQuery,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import SearchIcon from "@mui/icons-material/Search";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import StorefrontIcon from "@mui/icons-material/Storefront";
import { useAuth } from "../../contexts/AuthContext";
import { useOutlet } from "../../contexts/OutletContext";
import { useThemeMode } from "../../theme/ThemeModeContext";
import { getOutlets } from "../../api/outlets";
import Breadcrumbs from "./Breadcrumbs";

export default function TopBar({ onMenuClick, onOpenPalette }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { user, logout } = useAuth();
  const { selectedOutlet, setSelectedOutlet } = useOutlet();
  const { mode, toggleMode } = useThemeMode();
  const [outlets, setOutlets] = useState([]);
  const [anchor, setAnchor] = useState(null);

  useEffect(() => {
    if (user?.role === "admin") {
      getOutlets()
        .then(({ data }) => {
          setOutlets(data);
          if (!selectedOutlet && data.length > 0) {
            setSelectedOutlet({ id: data[0].id, name: data[0].outlet_name });
          }
        })
        .catch(() => {});
    }
  }, [user?.role]); // eslint-disable-line

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

        {user?.role === "admin" && outlets.length > 0 && (
          <Select
            size="small"
            value={selectedOutlet?.id ?? ""}
            onChange={(e) => {
              const found = outlets.find((o) => o.id === Number(e.target.value));
              if (found) setSelectedOutlet({ id: found.id, name: found.outlet_name });
            }}
            startAdornment={<StorefrontIcon fontSize="small" sx={{ mr: 0.5, color: "text.secondary" }} />}
            sx={{ minWidth: 160, display: { xs: "none", md: "inline-flex" } }}
          >
            {outlets.map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.outlet_name}</MenuItem>
            ))}
          </Select>
        )}

        <Tooltip title={mode === "dark" ? "Light mode" : "Dark mode"}>
          <IconButton onClick={toggleMode}>
            {mode === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Tooltip>

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
          <MuiMenuItem onClick={() => { setAnchor(null); toggleMode(); }}>
            <ListItemIcon>{mode === "dark" ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}</ListItemIcon>
            Toggle theme
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
