import { useEffect, useRef, useState } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Alert, Stack, Typography, Box } from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import api from "../api/client";
import { useAuth } from "../contexts/AuthContext";

/**
 * Wraps children and locks the screen after `timeoutMs` of user inactivity.
 * Unlock requires the current user's password. Any keystroke / mouse / touch
 * resets the timer.
 */
export default function IdleLock({ children, timeoutMs = 15 * 60 * 1000 }) {
  const { user, logout } = useAuth();
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const timerRef = useRef(null);

  const resetTimer = () => {
    if (locked) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setLocked(true), timeoutMs);
  };

  useEffect(() => {
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line
  }, [locked, timeoutMs]);

  const unlock = async () => {
    setError(""); setChecking(true);
    try {
      // Re-auth by hitting the login endpoint with current username + entered password
      await api.post("/auth/login/", { username: user.username, password });
      setLocked(false); setPassword("");
      resetTimer();
    } catch {
      setError("Incorrect password.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      {children}
      <Dialog open={locked} fullScreen PaperProps={{ sx: { bgcolor: "background.default" } }}>
        <Box sx={{ display: "grid", placeItems: "center", height: "100%" }}>
          <Box sx={{ maxWidth: 420, width: "100%", p: 3 }}>
            <Stack alignItems="center" spacing={2}>
              <LockIcon sx={{ fontSize: 64, color: "primary.main" }} />
              <Typography variant="h5">Screen locked</Typography>
              <Typography variant="body2" color="text.secondary" align="center">
                Idle for {Math.round(timeoutMs / 60000)} minutes. Enter password to continue.
              </Typography>
              <Typography variant="body2"><b>{user?.username}</b></Typography>
              <TextField
                autoFocus fullWidth type="password" label="Password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && password && unlock()}
              />
              {error && <Alert severity="error" sx={{ width: "100%" }}>{error}</Alert>}
              <Stack direction="row" spacing={1} sx={{ width: "100%" }}>
                <Button variant="outlined" color="warning" onClick={logout} sx={{ flex: 1 }}>Logout</Button>
                <Button variant="contained" onClick={unlock} disabled={!password || checking} sx={{ flex: 1 }}>
                  Unlock
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Box>
      </Dialog>
    </>
  );
}
