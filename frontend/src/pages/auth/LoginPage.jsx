import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Paper, TextField, Button, Typography, Stack, Alert, InputAdornment, IconButton, CircularProgress,
} from "@mui/material";
import InventoryIcon from "@mui/icons-material/Inventory";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import LoginIcon from "@mui/icons-material/Login";
import { useAuth } from "../../contexts/AuthContext";

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
      // Every user lands on the app launcher; from there they pick which
      // app (Stock / POS / E-commerce / Admin) to enter.
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
        placeItems: "center",
        p: 2,
        background: (t) =>
          t.palette.mode === "dark"
            ? "radial-gradient(circle at 20% 0%, #164534 0%, #0b1220 50%, #0b1220 100%)"
            : "radial-gradient(circle at 20% 0%, #dcfce7 0%, #f7f8fa 50%, #f7f8fa 100%)",
      }}
    >
      <Paper elevation={6} sx={{ width: "100%", maxWidth: 420, p: 4, borderRadius: 4 }}>
        <Stack spacing={3}>
          <Stack alignItems="center" spacing={1}>
            <Box sx={{ width: 56, height: 56, borderRadius: 3, bgcolor: "primary.main", color: "primary.contrastText", display: "grid", placeItems: "center" }}>
              <InventoryIcon />
            </Box>
            <Typography variant="h2" component="h1">Stock Count</Typography>
            <Typography variant="body2" color="text.secondary">Arunalu Super Mart</Typography>
          </Stack>

          {error && <Alert severity="error" variant="outlined">{error}</Alert>}

          <form onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                label="Username"
                autoFocus
                fullWidth
                autoComplete="username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
              <TextField
                label="Password"
                fullWidth
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton edge="end" onClick={() => setShow((s) => !s)} tabIndex={-1}>
                        {show ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={loading || !form.username || !form.password}
                startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <LoginIcon />}
                fullWidth
              >
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </Stack>
          </form>

          <Typography variant="caption" color="text.secondary" align="center">
            © {new Date().getFullYear()} Arunalu Super Mart · Stock Count System
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
