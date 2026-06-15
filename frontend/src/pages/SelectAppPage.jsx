import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Stack, ButtonBase, Avatar } from "@mui/material";
import InventoryIcon from "@mui/icons-material/Inventory2";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import HubIcon from "@mui/icons-material/Hub";
import LogoutIcon from "@mui/icons-material/Logout";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useAuth } from "../contexts/AuthContext";
import {
  availableSystems,
  defaultPathForSystem,
  ACTIVE_SYSTEM_STORAGE_KEY,
} from "../routes/config";

const TILES = {
  stock: {
    label: "Stock",
    tagline: "Inventory, counts & transactions",
    icon: InventoryIcon,
    accent: "#22c55e",
    glow: "rgba(34,197,94,0.35)",
  },
  org: {
    label: "Organization",
    tagline: "Master products, suppliers & demand planning",
    icon: HubIcon,
    accent: "#6366f1",
    glow: "rgba(99,102,241,0.35)",
  },
  admin: {
    label: "Admin",
    tagline: "Users, outlets, audit & settings",
    icon: AdminPanelSettingsIcon,
    accent: "#f59e0b",
    glow: "rgba(245,158,11,0.35)",
  },
};

const TEXT_PRIMARY = "#0f172a";
const TEXT_MUTED = "rgba(15,23,42,0.65)";
const TEXT_DIM = "rgba(15,23,42,0.45)";
const SURFACE_BORDER = "rgba(15,23,42,0.1)";
const SURFACE_BORDER_STRONG = "rgba(15,23,42,0.22)";

export default function SelectAppPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const systems = useMemo(() => availableSystems(user), [user]);

  // Launcher is the canonical landing page — even single-app users see it
  // so the login → choose → enter flow stays consistent.

  // When the user signs out from this page, the auth context clears the
  // user but doesn't navigate (the launcher route isn't permission-gated,
  // so PermissionRoute's `Navigate to=/login` never kicks in). Push to
  // /login ourselves once user is null.
  useEffect(() => {
    if (!user) navigate("/login", { replace: true });
  }, [user, navigate]);

  const pick = (system) => {
    try { localStorage.setItem(ACTIVE_SYSTEM_STORAGE_KEY, system); } catch { /* ignore */ }
    navigate(defaultPathForSystem(system, user), { replace: true });
  };

  const handleSignOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  if (!user) return null;

  const tileCount = systems.length;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        width: "100%",
        position: "relative",
        background: "radial-gradient(1200px 600px at 15% -10%, #dbeafe 0%, transparent 60%), radial-gradient(1000px 600px at 110% 110%, #ede9fe 0%, transparent 60%), linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
        color: TEXT_PRIMARY,
        display: "flex",
        flexDirection: "column",
        px: { xs: 3, md: 8 },
        py: { xs: 4, md: 5 },
      }}
    >
      {/* Top bar */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: 38, height: 38, borderRadius: 1.5,
              display: "grid", placeItems: "center",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              boxShadow: "0 10px 24px rgba(99,102,241,0.4)",
            }}
          >
            <InventoryIcon sx={{ color: "#fff", fontSize: 20 }} />
          </Box>
          <Box>
            <Typography sx={{ color: TEXT_PRIMARY, fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.1 }}>
              Arunalu Super Mart
            </Typography>
            <Typography sx={{ color: TEXT_DIM, fontSize: "0.7rem", letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Workspace
            </Typography>
          </Box>
        </Stack>
        <ButtonBase
          onClick={handleSignOut}
          sx={{
            borderRadius: 999,
            px: 2, py: 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 1,
            color: TEXT_MUTED,
            bgcolor: "rgba(255,255,255,0.7)",
            border: `1px solid ${SURFACE_BORDER}`,
            transition: "all 160ms ease",
            "&:hover": { bgcolor: "#fff", color: TEXT_PRIMARY, borderColor: SURFACE_BORDER_STRONG },
          }}
        >
          <LogoutIcon sx={{ fontSize: 16 }} />
          <Typography sx={{ fontSize: "0.82rem", fontWeight: 600 }}>Sign out</Typography>
        </ButtonBase>
      </Box>

      {/* Hero + tiles, centered as a single block */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", py: { xs: 6, md: 4 } }}>
        <Box sx={{ textAlign: "center", mb: { xs: 4, md: 6 }, maxWidth: 720, mx: "auto" }}>
          <Typography
            sx={{
              color: TEXT_DIM, fontSize: "0.72rem", letterSpacing: "0.22em",
              textTransform: "uppercase", fontWeight: 700, mb: 1.5,
            }}
          >
            Welcome back
          </Typography>
          <Typography
            sx={{
              color: TEXT_PRIMARY,
              fontWeight: 800,
              fontSize: { xs: "1.9rem", md: "2.6rem" },
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              mb: 1.5,
            }}
          >
            Hi {user.username}, choose your workspace
          </Typography>
          <Typography sx={{ color: TEXT_MUTED, fontSize: "1rem" }}>
            Select an application below to continue. You can switch between them anytime from the sidebar.
          </Typography>
        </Box>

        {systems.length === 0 ? (
          <Typography sx={{ color: TEXT_MUTED, textAlign: "center" }}>
            You don't have access to any application yet. Contact your administrator.
          </Typography>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
                md: `repeat(${Math.min(tileCount, 4)}, minmax(0, 1fr))`,
              },
              gap: { xs: 2, md: 3 },
              maxWidth: 1280,
              width: "100%",
              mx: "auto",
            }}
          >
            {systems.map((sys) => {
              const t = TILES[sys];
              if (!t) return null;
              const Icon = t.icon;
              return (
                <ButtonBase
                  key={sys}
                  onClick={() => pick(sys)}
                  focusRipple
                  sx={{
                    display: "block",
                    textAlign: "left",
                    width: "100%",
                    borderRadius: 3,
                    overflow: "hidden",
                    position: "relative",
                    bgcolor: "#ffffff",
                    border: `1px solid ${SURFACE_BORDER}`,
                    boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.04)",
                    transition: "transform 200ms ease, border-color 200ms ease, box-shadow 200ms ease",
                    "&::before": {
                      content: '""',
                      position: "absolute",
                      inset: 0,
                      background: `radial-gradient(420px 220px at 50% -20%, ${t.glow} 0%, transparent 70%)`,
                      opacity: 0,
                      transition: "opacity 220ms ease",
                      pointerEvents: "none",
                    },
                    "&:hover": {
                      transform: "translateY(-6px)",
                      borderColor: t.accent,
                      boxShadow: `0 24px 60px -20px ${t.glow}, 0 4px 12px rgba(15,23,42,0.06)`,
                      "&::before": { opacity: 1 },
                    },
                    "&:focus-visible": { borderColor: t.accent },
                  }}
                >
                  <Box sx={{ p: { xs: 3, md: 3.5 }, display: "flex", flexDirection: "column", gap: 2.5, minHeight: 260, position: "relative" }}>
                    <Avatar
                      variant="rounded"
                      sx={{
                        width: 56, height: 56,
                        background: `linear-gradient(135deg, ${t.accent}, ${t.accent}CC)`,
                        boxShadow: `0 12px 28px ${t.glow}`,
                      }}
                    >
                      <Icon sx={{ color: "#fff", fontSize: 28 }} />
                    </Avatar>

                    <Box>
                      <Typography
                        sx={{
                          color: TEXT_PRIMARY,
                          fontWeight: 800,
                          fontSize: "1.4rem",
                          letterSpacing: "-0.01em",
                          lineHeight: 1.1,
                          mb: 0.75,
                        }}
                      >
                        {t.label}
                      </Typography>
                      <Typography sx={{ color: TEXT_MUTED, fontSize: "0.9rem", lineHeight: 1.5 }}>
                        {t.tagline}
                      </Typography>
                    </Box>

                    <Box sx={{ flex: 1 }} />

                    <Stack direction="row" alignItems="center" spacing={1} sx={{ color: t.accent }}>
                      <Typography sx={{ fontWeight: 700, fontSize: "0.8rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                        Open
                      </Typography>
                      <ArrowForwardIcon sx={{ fontSize: 18 }} />
                    </Stack>
                  </Box>
                </ButtonBase>
              );
            })}
          </Box>
        )}
      </Box>

      <Typography sx={{ color: TEXT_DIM, fontSize: "0.75rem", textAlign: "center" }}>
        Signed in as <Box component="span" sx={{ color: TEXT_MUTED, fontWeight: 600 }}>{user.username}</Box>
        {user.role && (
          <>
            {" · "}
            <Box component="span" sx={{ textTransform: "capitalize" }}>{user.role.replace("_", " ")}</Box>
          </>
        )}
      </Typography>
    </Box>
  );
}
