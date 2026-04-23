import { useState, useEffect } from "react";
import { Box, Stack, Typography, IconButton, Chip, Menu, MenuItem, Divider } from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import DashboardIcon from "@mui/icons-material/Dashboard";
import { useAuth } from "../../contexts/AuthContext";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";

export default function TerminalShell({ children, shift, onHeaderClick }) {
  const { user, logout } = useAuth();
  const [now, setNow] = useState(new Date());
  const [anchorEl, setAnchorEl] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  };

  const canAdmin = user?.role && ["admin", "super_admin", "manager"].includes(user.role);

  const NavBtn = ({ to, icon, label }) => {
    const active = loc.pathname === to;
    return (
      <Box component={RouterLink} to={to}
        sx={{ textDecoration: "none", color: active ? "primary.main" : "text.secondary",
          px: 1.5, py: 0.5, borderRadius: 1, bgcolor: active ? "action.selected" : "transparent",
          display: "flex", alignItems: "center", gap: 0.5, fontSize: 14, fontWeight: 600 }}>
        {icon}{label}
      </Box>
    );
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", display: "flex", flexDirection: "column" }}>
      <Box sx={{ bgcolor: "primary.main", color: "primary.contrastText", px: 2, py: 1 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <PointOfSaleIcon />
            <Typography variant="h6" fontWeight={700}>Terminal</Typography>
          </Stack>
          {shift && (
            <Chip label={`Shift #${shift.id} · ${shift.outlet_name}`} color="default"
              sx={{ bgcolor: "rgba(255,255,255,0.2)", color: "inherit" }} />
          )}
          <Box sx={{ flex: 1 }} />
          <Stack direction="row" spacing={1} sx={{ bgcolor: "rgba(255,255,255,0.1)", px: 1, borderRadius: 1 }}>
            <NavBtn to="/terminal" icon={<PointOfSaleIcon fontSize="small" />} label="Sell" />
            <NavBtn to="/terminal/bills" icon={<ReceiptLongIcon fontSize="small" />} label="Bills" />
          </Stack>
          <Typography variant="body2" sx={{ fontFamily: "monospace", minWidth: 80, textAlign: "right" }}>
            {now.toLocaleTimeString()}
          </Typography>
          <IconButton size="small" onClick={toggleFullscreen} sx={{ color: "inherit" }}>
            {fullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </IconButton>
          <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ color: "inherit" }}>
            <AccountCircleIcon />
          </IconButton>
          <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
            <MenuItem disabled>{user?.username} ({user?.role})</MenuItem>
            <Divider />
            {canAdmin && (
              <MenuItem onClick={() => { setAnchorEl(null); nav("/"); }}>
                <DashboardIcon fontSize="small" sx={{ mr: 1 }} /> Admin
              </MenuItem>
            )}
            <MenuItem onClick={() => { logout(); }}>
              <LogoutIcon fontSize="small" sx={{ mr: 1 }} /> Logout
            </MenuItem>
          </Menu>
        </Stack>
      </Box>

      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        {children}
      </Box>
    </Box>
  );
}
