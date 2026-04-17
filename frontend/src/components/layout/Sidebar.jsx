import { Link, useLocation } from "react-router-dom";
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Typography, Divider, IconButton, Tooltip, useTheme, useMediaQuery,
} from "@mui/material";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import InventoryIcon from "@mui/icons-material/Inventory";
import { useAuth } from "../../contexts/AuthContext";
import { routesForRole, GROUP_ORDER } from "../../routes/config";

export const SIDEBAR_WIDTH = 248;
export const SIDEBAR_COLLAPSED = 68;

export default function Sidebar({ open, collapsed, onClose, onToggleCollapse }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { user } = useAuth();
  const location = useLocation();
  const role = user?.role;
  const items = routesForRole(role);

  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    items: items.filter((i) => i.group === g),
  })).filter((g) => g.items.length > 0);

  const content = (
    <Box
      sx={{
        width: collapsed && !isMobile ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH,
        height: "100%",
        bgcolor: "background.sidebar",
        color: "text.sidebar",
        display: "flex",
        flexDirection: "column",
        transition: "width 180ms ease",
        overflow: "hidden",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, px: collapsed && !isMobile ? 0 : 2, py: 1.75, height: 64, justifyContent: collapsed && !isMobile ? "center" : "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
          <Box sx={{ width: 34, height: 34, borderRadius: 2, bgcolor: "primary.main", color: "primary.contrastText", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <InventoryIcon fontSize="small" />
          </Box>
          {(!collapsed || isMobile) && (
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ color: "text.sidebar", fontWeight: 700, lineHeight: 1.2 }} noWrap>
                Arunalu Stock
              </Typography>
              <Typography variant="caption" sx={{ color: "text.sidebarMuted" }} noWrap>
                Super Mart
              </Typography>
            </Box>
          )}
        </Box>
        {!isMobile && (!collapsed) && (
          <IconButton size="small" onClick={onToggleCollapse} sx={{ color: "text.sidebarMuted" }}>
            <MenuOpenIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      <Divider sx={{ borderColor: "rgba(148,163,184,0.12)" }} />

      <Box sx={{ flex: 1, overflowY: "auto", py: 1 }}>
        {grouped.map((g) => (
          <Box key={g.group} sx={{ mb: 1 }}>
            {(!collapsed || isMobile) && (
              <Typography
                variant="overline"
                sx={{ px: 2.5, color: "text.sidebarMuted", fontSize: "0.65rem", display: "block", mb: 0.25 }}
              >
                {g.group}
              </Typography>
            )}
            <List dense disablePadding>
              {g.items.map((item) => {
                const active = location.pathname === item.path;
                const Icon = item.icon;
                const button = (
                  <ListItemButton
                    component={Link}
                    to={item.path}
                    onClick={isMobile ? onClose : undefined}
                    selected={active}
                    sx={{
                      mx: 1,
                      borderRadius: 2,
                      minHeight: 40,
                      px: collapsed && !isMobile ? 1.25 : 1.5,
                      justifyContent: collapsed && !isMobile ? "center" : "flex-start",
                      color: "text.sidebar",
                      "&.Mui-selected": {
                        bgcolor: "primary.main",
                        color: "primary.contrastText",
                        "& .MuiListItemIcon-root": { color: "primary.contrastText" },
                        "&:hover": { bgcolor: "primary.dark" },
                      },
                      "&:hover": { bgcolor: "background.sidebarHover" },
                    }}
                  >
                    <ListItemIcon sx={{ color: "text.sidebarMuted", minWidth: 0, mr: collapsed && !isMobile ? 0 : 1.5, justifyContent: "center" }}>
                      {Icon ? <Icon fontSize="small" /> : null}
                    </ListItemIcon>
                    {(!collapsed || isMobile) && (
                      <ListItemText
                        primary={item.label}
                        primaryTypographyProps={{ fontSize: "0.8125rem", fontWeight: active ? 600 : 500, noWrap: true }}
                      />
                    )}
                  </ListItemButton>
                );
                return collapsed && !isMobile ? (
                  <Tooltip key={item.path} title={item.label} placement="right">
                    <span>{button}</span>
                  </Tooltip>
                ) : (
                  <Box key={item.path}>{button}</Box>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      <Divider sx={{ borderColor: "rgba(148,163,184,0.12)" }} />
      <Box sx={{ px: 2, py: 1.25, display: "flex", alignItems: "center", gap: 1, justifyContent: collapsed && !isMobile ? "center" : "flex-start" }}>
        {(!collapsed || isMobile) ? (
          <Typography variant="caption" sx={{ color: "text.sidebarMuted" }} noWrap>
            v0.1 · {user?.username}
          </Typography>
        ) : (
          <Tooltip title={user?.username || ""} placement="right">
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "success.main" }} />
          </Tooltip>
        )}
      </Box>
    </Box>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onClose={onClose} PaperProps={{ sx: { bgcolor: "background.sidebar", border: "none" } }}>
        {content}
      </Drawer>
    );
  }
  return (
    <Box sx={{ flexShrink: 0, height: "100vh", position: "sticky", top: 0 }}>
      {content}
    </Box>
  );
}
