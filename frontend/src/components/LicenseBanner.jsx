import { Alert, Box } from "@mui/material";
import { useLicense } from "../contexts/LicenseContext";

export default function LicenseBanner() {
  const { licenseState, license } = useLicense();

  if (licenseState === "active" || licenseState === "unconfigured" || licenseState === "unknown") return null;

  if (licenseState === "grace") {
    return (
      <Box sx={{ mb: 2 }}>
        <Alert severity="warning" variant="filled">
          Your subscription has expired. Please pay by {license.grace_until || "the grace period deadline"} to avoid service interruption.
        </Alert>
      </Box>
    );
  }

  if (licenseState === "readonly") {
    return (
      <Box sx={{ mb: 2 }}>
        <Alert severity="error" variant="filled">
          Subscription unpaid. The system is in read-only mode. Contact your service provider.
        </Alert>
      </Box>
    );
  }

  if (licenseState === "locked") {
    return (
      <Box sx={{ mb: 2 }}>
        <Alert severity="error" variant="filled">
          Your license has expired. The system is locked. Contact your service provider.
        </Alert>
      </Box>
    );
  }

  return null;
}
