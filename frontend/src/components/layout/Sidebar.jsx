import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Typography, Divider, IconButton, Tooltip, Collapse, useTheme, useMediaQuery,
} from "@mui/material";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import InventoryIcon from "@mui/icons-material/Inventory";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useAuth } from "../../contexts/AuthContext";
import { routesForPermissions, GROUP_ORDER, DEFAULT_EXPANDED_GROUPS } from "../../routes/config";

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

export const SIDEBAR_WIDTH = 248;
export const SIDEBAR_COLLAPSED = 68;

export default function Sidebar({ open, collapsed, onClose, onToggleCollapse }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { user } = useAuth();
  const location = useLocation();
  const items = routesForPermissions(user?.permissions);

  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    items: items.filter((i) => i.group === g),
  })).filter((g) => g.items.length > 0);

  // Which groups are expanded. Persisted per-group in localStorage. Keep the
  // active route's group always open so the user sees where they are.
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
        {grouped.map((g) => {
          const isCollapsedRail = collapsed && !isMobile;
          const isOpen = isCollapsedRail ? true : Boolean(expanded[g.group]);
          return (
            <Box key={g.group} sx={{ mb: 0.25 }}>
              {!isCollapsedRail && (
                <ListItemButton
                  onClick={() => toggleGroup(g.group)}
                  sx={{
                    mx: 1,
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 2,
                    minHeight: 32,
                    "&:hover": { bgcolor: "background.sidebarHover" },
                  }}
                >
                  <Typography
                    variant="overline"
                    sx={{
                      flex: 1,
                      color: "text.sidebarMuted",
                      fontSize: "0.65rem",
                      lineHeight: 1.4,
                      letterSpacing: 0.6,
                    }}
                  >
                    {g.group}
                  </Typography>
                  <ExpandMoreIcon
                    fontSize="inherit"
                    sx={{
                      fontSize: 16,
                      color: "text.sidebarMuted",
                      transition: "transform 160ms ease",
                      transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                    }}
                  />
                </ListItemButton>
              )}
              <Collapse in={isOpen} timeout={160} unmountOnExit>
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
                          minHeight: 36,
                          px: isCollapsedRail ? 1.25 : 1.5,
                          justifyContent: isCollapsedRail ? "center" : "flex-start",
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
                        <ListItemIcon sx={{ color: "text.sidebarMuted", minWidth: 0, mr: isCollapsedRail ? 0 : 1.5, justifyContent: "center" }}>
                          {Icon ? <Icon fontSize="small" /> : null}
                        </ListItemIcon>
                        {!isCollapsedRail && (
                          <ListItemText
                            primary={item.label}
                            primaryTypographyProps={{ fontSize: "0.8125rem", fontWeight: active ? 600 : 500, noWrap: true }}
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
