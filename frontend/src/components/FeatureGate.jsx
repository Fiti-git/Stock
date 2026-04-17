import { Box, Typography } from "@mui/material";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { useLicense } from "../contexts/LicenseContext";

export default function FeatureGate({ feature, children, fallback }) {
  const { hasFeature } = useLicense();

  if (hasFeature(feature)) return children;
  if (fallback) return fallback;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "40vh", textAlign: "center", p: 4 }}>
      <LockOutlinedIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
      <Typography variant="h5" gutterBottom color="text.secondary">Feature Not Available</Typography>
      <Typography variant="body1" color="text.disabled" sx={{ maxWidth: 400 }}>
        This feature is not included in your current subscription. Contact your service provider to enable it.
      </Typography>
    </Box>
  );
}
