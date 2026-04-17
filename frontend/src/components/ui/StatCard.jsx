import { Box, Card, CardContent, Typography, Stack } from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";

export default function StatCard({ label, value, delta, icon, color = "primary", loading }) {
  const positive = typeof delta === "number" ? delta >= 0 : null;
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" color="text.secondary">{label}</Typography>
            <Typography variant="h2" sx={{ mt: 0.5, lineHeight: 1.2 }} noWrap>
              {loading ? "—" : value ?? "—"}
            </Typography>
            {delta !== undefined && delta !== null && !loading && (
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
                {positive ? <TrendingUpIcon fontSize="small" color="success" /> : <TrendingDownIcon fontSize="small" color="error" />}
                <Typography variant="caption" color={positive ? "success.main" : "error.main"} fontWeight={600}>
                  {positive ? "+" : ""}{delta}%
                </Typography>
                <Typography variant="caption" color="text.secondary">vs last period</Typography>
              </Stack>
            )}
          </Box>
          {icon && (
            <Box sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: `${color}.main`, color: `${color}.contrastText`, display: "grid", placeItems: "center", flexShrink: 0 }}>
              {icon}
            </Box>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
