import { useEffect, useState } from "react";
import { Box, useTheme, useMediaQuery } from "@mui/material";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import CommandPalette from "./CommandPalette";

export default function AppShell({ children }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  // Sidebar starts collapsed to the icon rail by default so managers land on
  // a compact layout with maximum room for the page content. User can still
  // expand it via the hamburger, and localStorage remembers their choice
  // across sessions.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem("sidebar_collapsed_v1");
      return saved === null ? true : saved === "1";
    } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem("sidebar_collapsed_v1", collapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [collapsed]);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <Sidebar
        open={mobileOpen}
        collapsed={collapsed}
        onClose={() => setMobileOpen(false)}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar
          onMenuClick={() => setMobileOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        <Box component="main" sx={{ flex: 1, px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 }, minWidth: 0 }}>
          {children}
        </Box>
      </Box>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </Box>
  );
}
