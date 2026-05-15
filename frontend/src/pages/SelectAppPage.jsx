import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Card, CardActionArea, Stack, Avatar } from "@mui/material";
import InventoryIcon from "@mui/icons-material/Inventory2";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import ShoppingBagIcon from "@mui/icons-material/ShoppingBag";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import LogoutIcon from "@mui/icons-material/Logout";
import { useAuth } from "../contexts/AuthContext";
import {
  availableSystems,
  defaultPathForSystem,
  ACTIVE_SYSTEM_STORAGE_KEY,
} from "../routes/config";

const TILES = {
  stock: {
    label: "Stock",
    tagline: "Inventory, counts, transactions",
    icon: InventoryIcon,
    color: "#2e7d32",
  },
  pos: {
    label: "POS",
    tagline: "Terminal, bills, shifts, sales",
    icon: PointOfSaleIcon,
    color: "#1565c0",
  },
  ecom: {
    label: "E-commerce",
    tagline: "Online orders & product catalog",
    icon: ShoppingBagIcon,
    color: "#6a1b9a",
  },
  admin: {
    label: "Admin",
    tagline: "Users, outlets, audit, settings",
    icon: AdminPanelSettingsIcon,
    color: "#455a64",
  },
};

export default function SelectAppPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const systems = useMemo(() => availableSystems(user), [user]);

  // Single-system users have no choice to make — skip the launcher.
  useEffect(() => {
    if (systems.length === 1) {
      const only = systems[0];
      try { localStorage.setItem(ACTIVE_SYSTEM_STORAGE_KEY, only); } catch { /* ignore */ }
      navigate(defaultPathForSystem(only, user), { replace: true });
    }
  }, [systems, user, navigate]);

  const pick = (system) => {
    try { localStorage.setItem(ACTIVE_SYSTEM_STORAGE_KEY, system); } catch { /* ignore */ }
    navigate(defaultPathForSystem(system, user), { replace: true });
  };

  if (!user) return null;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        width: "100%",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #334155 100%)",
        color: "#f1f5f9",
        display: "flex",
        flexDirection: "column",
        px: { xs: 3, md: 8 },
        py: { xs: 4, md: 6 },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: { xs: 4, md: 8 } }}>
        <Box>
          <Typography variant="overline" sx={{ letterSpacing: "0.18em", color: "rgba(241,245,249,0.6)" }}>
            Arunalu Super Mart
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 800, mt: 0.5 }}>
            Welcome back, {user.username}
          </Typography>
          <Typography variant="body2" sx={{ color: "rgba(241,245,249,0.7)", mt: 0.5 }}>
            Choose an application to continue.
          </Typography>
        </Box>
        <CardActionArea
          onClick={logout}
          sx={{
            width: "auto",
            borderRadius: 2,
            px: 2, py: 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 1,
            color: "rgba(241,245,249,0.85)",
            border: "1px solid rgba(241,245,249,0.2)",
            "&:hover": { bgcolor: "rgba(241,245,249,0.08)" },
          }}
        >
          <LogoutIcon fontSize="small" />
          <Typography variant="body2">Sign out</Typography>
        </CardActionArea>
      </Box>

      <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {systems.length === 0 ? (
          <Typography variant="body1" sx={{ color: "rgba(241,245,249,0.7)" }}>
            You don't have access to any application yet. Contact your administrator.
          </Typography>
        ) : (
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={{ xs: 2.5, md: 4 }}
            sx={{ width: "100%", maxWidth: 1200, justifyContent: "center", flexWrap: "wrap" }}
          >
            {systems.map((sys) => {
              const t = TILES[sys];
              if (!t) return null;
              const Icon = t.icon;
              return (
                <Card
                  key={sys}
                  elevation={0}
                  sx={{
                    flex: 1,
                    minWidth: { xs: "100%", md: 260 },
                    maxWidth: 340,
                    bgcolor: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(241,245,249,0.12)",
                    backdropFilter: "blur(8px)",
                    borderRadius: 3,
                    overflow: "hidden",
                    transition: "transform 180ms ease, border-color 180ms ease, background-color 180ms ease",
                    "&:hover": {
                      transform: "translateY(-4px)",
                      borderColor: t.color,
                      bgcolor: "rgba(255,255,255,0.07)",
                    },
                  }}
                >
                  <CardActionArea onClick={() => pick(sys)} sx={{ p: { xs: 3, md: 4 }, height: "100%" }}>
                    <Stack spacing={2.5} sx={{ height: "100%" }}>
                      <Avatar
                        variant="rounded"
                        sx={{
                          bgcolor: t.color,
                          width: 56, height: 56,
                          boxShadow: `0 10px 24px ${t.color}55`,
                        }}
                      >
                        <Icon fontSize="medium" />
                      </Avatar>
                      <Box>
                        <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: "-0.01em" }}>
                          {t.label}
                        </Typography>
                        <Typography variant="body2" sx={{ color: "rgba(241,245,249,0.65)", mt: 0.5 }}>
                          {t.tagline}
                        </Typography>
                      </Box>
                      <Box sx={{ flex: 1 }} />
                      <Typography
                        variant="button"
                        sx={{ color: t.color, fontWeight: 700, letterSpacing: "0.08em" }}
                      >
                        Open →
                      </Typography>
                    </Stack>
                  </CardActionArea>
                </Card>
              );
            })}
          </Stack>
        )}
      </Box>

      <Typography variant="caption" sx={{ color: "rgba(241,245,249,0.45)", textAlign: "center", mt: 4 }}>
        You can switch between apps anytime from the sidebar.
      </Typography>
    </Box>
  );
}
