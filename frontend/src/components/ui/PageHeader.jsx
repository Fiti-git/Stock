import { Box, Typography, Stack } from "@mui/material";

export default function PageHeader({ title, subtitle, actions, icon }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: { xs: "flex-start", md: "center" },
        justifyContent: "space-between",
        gap: 2,
        mb: 3,
        flexDirection: { xs: "column", md: "row" },
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center">
        {icon && (
          <Box sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: "primary.main", color: "primary.contrastText", display: "grid", placeItems: "center" }}>
            {icon}
          </Box>
        )}
        <Box>
          <Typography variant="h3" component="h1">{title}</Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Stack>
      {actions && <Stack direction="row" spacing={1.25} flexWrap="wrap">{actions}</Stack>}
    </Box>
  );
}
