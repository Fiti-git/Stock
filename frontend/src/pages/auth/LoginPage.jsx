import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, TextField, Button, Typography, Stack, Alert,
  InputAdornment, IconButton, CircularProgress,
} from "@mui/material";
import InventoryIcon from "@mui/icons-material/Inventory2";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import LoginIcon from "@mui/icons-material/Login";
import ShieldIcon from "@mui/icons-material/VerifiedUser";
import BoltIcon from "@mui/icons-material/Bolt";
import LayersIcon from "@mui/icons-material/Layers";
import { useAuth } from "../../contexts/AuthContext";

const TEXT_PRIMARY = "#0f172a";
const TEXT_MUTED = "rgba(15,23,42,0.65)";
const TEXT_DIM = "rgba(15,23,42,0.5)";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.username, form.password);
      navigate("/select-app");
    } catch (err) {
      setError(err.response?.data?.detail || "Login failed. Check your username and password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
      }}
    >
      {/* Left: brand panel (hidden on mobile) */}
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          position: "relative",
          flexDirection: "column",
          justifyContent: "space-between",
          p: 6,
          overflow: "hidden",
          background: "radial-gradient(800px 500px at 0% 0%, #dbeafe 0%, transparent 60%), radial-gradient(700px 500px at 100% 100%, #ede9fe 0%, transparent 60%), linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%)",
          borderRight: "1px solid rgba(15,23,42,0.08)",
        }}
      >
        {/* Brand */}
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: 44, height: 44, borderRadius: 2,
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "grid", placeItems: "center",
              boxShadow: "0 12px 28px rgba(99,102,241,0.35)",
            }}
          >
            <InventoryIcon sx={{ color: "#fff", fontSize: 22 }} />
          </Box>
          <Box>
            <Typography sx={{ color: TEXT_PRIMARY, fontWeight: 800, fontSize: "1.05rem", lineHeight: 1.1 }}>
              Arunalu Super Mart
            </Typography>
            <Typography sx={{ color: TEXT_DIM, fontSize: "0.72rem", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600 }}>
              Operations Suite
            </Typography>
          </Box>
        </Stack>

        {/* Headline */}
        <Box sx={{ maxWidth: 480 }}>
          <Typography
            sx={{
              color: TEXT_PRIMARY,
              fontWeight: 800,
              fontSize: { md: "2.4rem", lg: "2.8rem" },
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              mb: 2,
            }}
          >
            One workspace for every part of the store.
          </Typography>
          <Typography sx={{ color: TEXT_MUTED, fontSize: "1.02rem", lineHeight: 1.6 }}>
            Stock counts, POS, e-commerce and admin — unified under a single sign-in.
            Pick your app after login and pick up where you left off.
          </Typography>
        </Box>

        {/* Feature row */}
        <Stack spacing={2}>
          {[
            { Icon: BoltIcon, label: "Real-time inventory across every outlet" },
            { Icon: LayersIcon, label: "Stock, POS and e-commerce in one place" },
            { Icon: ShieldIcon, label: "Role-based access with full audit trail" },
          ].map(({ Icon, label }) => (
            <Stack key={label} direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 34, height: 34, borderRadius: 1.5,
                  display: "grid", placeItems: "center",
                  bgcolor: "#fff",
                  border: "1px solid rgba(15,23,42,0.08)",
                  color: "#6366f1",
                  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
                }}
              >
                <Icon sx={{ fontSize: 18 }} />
              </Box>
              <Typography sx={{ color: TEXT_MUTED, fontSize: "0.92rem" }}>{label}</Typography>
            </Stack>
          ))}
        </Stack>
      </Box>

      {/* Right: form */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: { xs: 3, sm: 6 },
          py: { xs: 6, md: 0 },
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 420 }}>
          {/* Mobile brand */}
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ display: { xs: "flex", md: "none" }, mb: 4 }}>
            <Box
              sx={{
                width: 40, height: 40, borderRadius: 1.5,
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                display: "grid", placeItems: "center",
                boxShadow: "0 10px 24px rgba(99,102,241,0.3)",
              }}
            >
              <InventoryIcon sx={{ color: "#fff", fontSize: 20 }} />
            </Box>
            <Typography sx={{ color: TEXT_PRIMARY, fontWeight: 800, fontSize: "1rem" }}>
              Arunalu Super Mart
            </Typography>
          </Stack>

          <Typography
            sx={{
              color: TEXT_DIM, fontSize: "0.72rem", letterSpacing: "0.2em",
              textTransform: "uppercase", fontWeight: 700, mb: 1,
            }}
          >
            Sign in
          </Typography>
          <Typography
            sx={{
              color: TEXT_PRIMARY,
              fontWeight: 800,
              fontSize: { xs: "1.7rem", sm: "2rem" },
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
              mb: 1,
            }}
          >
            Welcome back
          </Typography>
          <Typography sx={{ color: TEXT_MUTED, fontSize: "0.95rem", mb: 4 }}>
            Enter your credentials to access your workspace.
          </Typography>

          {error && (
            <Alert severity="error" variant="outlined" sx={{ mb: 2.5 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} autoComplete="on">
            <Stack spacing={2.25}>
              <Box>
                <Typography sx={{ color: TEXT_PRIMARY, fontSize: "0.82rem", fontWeight: 600, mb: 0.75 }}>
                  Username
                </Typography>
                <TextField
                  autoFocus
                  fullWidth
                  size="medium"
                  placeholder="your.username"
                  autoComplete="username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      bgcolor: "#fff",
                      borderRadius: 1.5,
                      "& fieldset": { borderColor: "rgba(15,23,42,0.14)" },
                      "&:hover fieldset": { borderColor: "rgba(15,23,42,0.28)" },
                      "&.Mui-focused fieldset": { borderColor: "#6366f1", borderWidth: 1.5 },
                    },
                  }}
                />
              </Box>
              <Box>
                <Typography sx={{ color: TEXT_PRIMARY, fontSize: "0.82rem", fontWeight: 600, mb: 0.75 }}>
                  Password
                </Typography>
                <TextField
                  fullWidth
                  size="medium"
                  placeholder="••••••••"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton edge="end" onClick={() => setShow((s) => !s)} tabIndex={-1} size="small">
                          {show ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      bgcolor: "#fff",
                      borderRadius: 1.5,
                      "& fieldset": { borderColor: "rgba(15,23,42,0.14)" },
                      "&:hover fieldset": { borderColor: "rgba(15,23,42,0.28)" },
                      "&.Mui-focused fieldset": { borderColor: "#6366f1", borderWidth: 1.5 },
                    },
                  }}
                />
              </Box>
              <Button
                type="submit"
                size="large"
                disabled={loading || !form.username || !form.password}
                startIcon={loading ? <CircularProgress size={18} sx={{ color: "#fff" }} /> : <LoginIcon />}
                fullWidth
                sx={{
                  mt: 1,
                  py: 1.35,
                  textTransform: "none",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  borderRadius: 1.5,
                  color: "#fff",
                  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                  boxShadow: "0 10px 24px rgba(99,102,241,0.35)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
                    boxShadow: "0 14px 30px rgba(99,102,241,0.45)",
                  },
                  "&.Mui-disabled": {
                    background: "rgba(15,23,42,0.12)",
                    color: "rgba(15,23,42,0.4)",
                    boxShadow: "none",
                  },
                }}
              >
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </Stack>
          </form>

          <Typography sx={{ color: TEXT_DIM, fontSize: "0.78rem", textAlign: "center", mt: 5 }}>
            © {new Date().getFullYear()} Arunalu Super Mart · All rights reserved
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
