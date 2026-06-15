import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Typography, IconButton, Tooltip, Collapse, Avatar, useTheme, useMediaQuery,
} from "@mui/material";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import MenuIcon from "@mui/icons-material/Menu";
import InventoryIcon from "@mui/icons-material/Inventory";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LogoutIcon from "@mui/icons-material/Logout";
import { useAuth } from "../../contexts/AuthContext";
import { useSystem } from "../../contexts/SystemContext";
import {
  routesForPermissions,
  GROUP_ORDER,
  DEFAULT_EXPANDED_GROUPS,
} from "../../routes/config";

const EXPANDED_STORAGE_KEY = "sidebar_expanded_groups_v1";

function loadExpandedState() {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch { /* ignore */ }
  return null;
}

function saveExpandedState(state) {
  try { localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

export const SIDEBAR_WIDTH = 280;
export const SIDEBAR_COLLAPSED = 88;

export default function Sidebar({ open, collapsed, onClose, onToggleCollapse }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { user, logout } = useAuth();
  const location = useLocation();

  // Active system + app switching live in the TopBar (SystemContext). The
  // sidebar only renders the routes for the active app.
  const { activeSystem } = useSystem();

  const items = routesForPermissions(user?.permissions, activeSystem);

  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    items: items.filter((i) => i.group === g),
  })).filter((g) => g.items.length > 0);

  const activeGroup = useMemo(() => {
    const current = items.find((i) => i.path === location.pathname);
    return current?.group;
  }, [items, location.pathname]);

  const [expanded, setExpanded] = useState(() => {
    const saved = loadExpandedState() || {};
    const initial = {};
    for (const g of GROUP_ORDER) {
      initial[g] = saved[g] ?? DEFAULT_EXPANDED_GROUPS.has(g);
    }
    return initial;
  });

  useEffect(() => {
    if (activeGroup && !expanded[activeGroup]) {
      setExpanded((prev) => ({ ...prev, [activeGroup]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup]);

  const toggleGroup = (g) => {
    setExpanded((prev) => {
      const next = { ...prev, [g]: !prev[g] };
      saveExpandedState(next);
      return next;
    });
  };

  const isCollapsedRail = collapsed && !isMobile;
  const width = isCollapsedRail ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH;
  const initials = (user?.username || "?").slice(0, 2).toUpperCase();

  const content = (
    <Box
      sx={{
        width,
        height: "100%",
        bgcolor: "background.sidebar",
        color: "text.sidebar",
        borderRight: "1px dashed",
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        transition: "width 180ms ease",
        overflow: "hidden",
      }}
    >
      {/* Brand lockup — shows Arunalu + active app */}
      <Box
        sx={{
          display: "flex", alignItems: "center",
          gap: 1.5,
          px: isCollapsedRail ? 0 : 2.5,
          py: 2,
          height: 72,
          justifyContent: isCollapsedRail ? "center" : "space-between",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
          <Box
            sx={{
              width: 40, height: 40, borderRadius: 2,
              bgcolor: "primary.main", color: "primary.contrastText",
              display: "grid", placeItems: "center",
              boxShadow: (t) => t.customShadows?.primary,
              flexShrink: 0,
            }}
          >
            <InventoryIcon fontSize="small" />
          </Box>
          {!isCollapsedRail && (
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.2, color: "text.primary" }} noWrap>
                Arunalu
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }} noWrap>
                Super Mart
              </Typography>
            </Box>
          )}
        </Box>
        {!isMobile && !isCollapsedRail && (
          <Tooltip title="Collapse sidebar">
            <IconButton size="small" onClick={onToggleCollapse} sx={{ color: "text.secondary" }}>
              <MenuOpenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {/* Expand button — only visible when collapsed to the icon rail.
          Previously the toggle was hidden in this mode, leaving users no
          way to re-open the sidebar without a page reload. */}
      {isCollapsedRail && (
        <Box sx={{ display: "flex", justifyContent: "center", pb: 1 }}>
          <Tooltip title="Expand sidebar" placement="right">
            <IconButton size="small" onClick={onToggleCollapse} sx={{ color: "text.secondary" }}>
              <MenuIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* App + outlet switchers live in the TopBar now — sidebar is nav-only. */}

      {/* Nav */}
      <Box sx={{ flex: 1, overflowY: "auto", px: 1, py: 1 }}>
        {grouped.map((g) => {
          const isOpen = isCollapsedRail ? true : Boolean(expanded[g.group]);
          return (
            <Box key={g.group} sx={{ mb: 1 }}>
              {!isCollapsedRail && (
                <ListItemButton
                  onClick={() => toggleGroup(g.group)}
                  disableRipple
                  sx={{
                    px: 1.5, py: 0.5,
                    borderRadius: 1,
                    minHeight: 28,
                    "&:hover": { bgcolor: "transparent" },
                  }}
                >
                  <Typography
                    variant="overline"
                    sx={{
                      flex: 1,
                      color: "text.secondary",
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      lineHeight: 1.4,
                      letterSpacing: "0.08em",
                    }}
                  >
                    {g.group}
                  </Typography>
                  <ExpandMoreIcon
                    sx={{
                      fontSize: 16,
                      color: "text.secondary",
                      transition: "transform 160ms ease",
                      transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                    }}
                  />
                </ListItemButton>
              )}
              <Collapse in={isOpen} timeout={160} unmountOnExit>
                <List dense disablePadding sx={{ mt: 0.25 }}>
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
                          mx: 0.5,
                          mb: 0.25,
                          borderRadius: 1.5,
                          minHeight: 40,
                          px: isCollapsedRail ? 1.25 : 1.5,
                          justifyContent: isCollapsedRail ? "center" : "flex-start",
                          color: "text.sidebar",
                          fontWeight: 500,
                          position: "relative",
                          "&.Mui-selected": {
                            bgcolor: "primary.lighter",
                            color: "primary.dark",
                            fontWeight: 700,
                            "& .MuiListItemIcon-root": { color: "primary.main" },
                            "& .MuiListItemText-primary": { fontWeight: 700 },
                            "&:hover": { bgcolor: "primary.lighter" },
                          },
                          "&:hover": { bgcolor: "background.sidebarHover" },
                        }}
                      >
                        <ListItemIcon
                          sx={{
                            color: "text.sidebarMuted",
                            minWidth: 0,
                            mr: isCollapsedRail ? 0 : 2,
                            justifyContent: "center",
                          }}
                        >
                          {Icon ? <Icon fontSize="small" /> : null}
                        </ListItemIcon>
                        {!isCollapsedRail && (
                          <ListItemText
                            primary={item.label}
                            primaryTypographyProps={{
                              fontSize: "0.8125rem",
                              fontWeight: active ? 700 : 500,
                              noWrap: true,
                            }}
                          />
                        )}
                      </ListItemButton>
                    );
                    return isCollapsedRail ? (
                      <Tooltip key={item.path} title={item.label} placement="right">
                        <span>{button}</span>
                      </Tooltip>
                    ) : (
                      <Box key={item.path}>{button}</Box>
                    );
                  })}
                </List>
              </Collapse>
            </Box>
          );
        })}
      </Box>

      {/* User card */}
      <Box
        sx={{
          m: 2,
          p: isCollapsedRail ? 1 : 2,
          borderRadius: 2,
          bgcolor: "background.neutral",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          justifyContent: isCollapsedRail ? "center" : "flex-start",
        }}
      >
        <Avatar sx={{ width: 36, height: 36, bgcolor: "primary.main", fontSize: "0.85rem", fontWeight: 700 }}>
          {initials}
        </Avatar>
        {!isCollapsedRail && (
          <>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
                {user?.username || "—"}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", textTransform: "capitalize" }} noWrap>
                {(user?.role || "").replace("_", " ")}
              </Typography>
            </Box>
            <Tooltip title="Logout">
              <IconButton size="small" onClick={logout} sx={{ color: "text.secondary" }}>
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
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
