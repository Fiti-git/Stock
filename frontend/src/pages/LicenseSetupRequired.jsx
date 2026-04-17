import { useNavigate } from "react-router-dom";
import { Box, Card, CardContent, Typography, Button, Stack } from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import { useAuth } from "../contexts/AuthContext";

export default function LicenseSetupRequired() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isServiceProvider = user?.role === "ServiceProvider";

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2, bgcolor: "background.default" }}>
      <Card variant="outlined" sx={{ maxWidth: 460, width: "100%" }}>
        <CardContent sx={{ textAlign: "center", p: 4 }}>
          <Box sx={{ width: 64, height: 64, borderRadius: "50%", bgcolor: "action.hover", display: "grid", placeItems: "center", mx: "auto", mb: 2 }}>
            <SettingsIcon sx={{ fontSize: 36, color: "text.secondary" }} />
          </Box>
          <Typography variant="h3" gutterBottom>License Setup Required</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            This system has not been configured with a license yet.
            A ServiceProvider administrator needs to complete the initial setup.
          </Typography>
          <Stack direction="row" justifyContent="center">
            {user && isServiceProvider ? (
              <Button variant="contained" size="large" onClick={() => navigate("/admin/license-configuration")}>Go to License Setup</Button>
            ) : user ? (
              <Typography variant="caption" color="text.secondary">
                You do not have permission to configure the license. Contact your service provider.
              </Typography>
            ) : (
              <Button variant="outlined" size="large" onClick={() => navigate("/login")}>Go to Login</Button>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
