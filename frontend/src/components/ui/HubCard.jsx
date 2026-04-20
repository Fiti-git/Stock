import { Link as RouterLink } from "react-router-dom";
import { Box, Card, CardContent, Typography, Stack, Button, Chip } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

/**
 * Unified hub landing card. Used by TransactionsHub, OperationsHub, and any
 * future role-based home "quick action" grids. Accepts an MUI palette color
 * (`primary` / `secondary` / `info` / `success` / `warning` / `error`) as
 * `accent` — this keeps every hub on-brand and consistent with the theme,
 * instead of hardcoding hex values per card.
 */
export default function HubCard({
  icon,
  title,
  description,
  accent = "primary",
  chips = [],
  children,
  primaryAction,
  secondaryAction,
  to,
  buttonLabel = "Open",
}) {
  const Icon = icon;
  return (
    <Card
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        transition: "transform 180ms ease, box-shadow 180ms ease",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: (t) => t.customShadows?.z16,
        },
      }}
    >
      <CardContent sx={{ flex: 1, pb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1.5 }}>
          <Box
            sx={{
              width: 48, height: 48, borderRadius: 2,
              bgcolor: `${accent}.lighter`,
              color:   `${accent}.dark`,
              display: "grid", placeItems: "center",
              flexShrink: 0,
            }}
          >
            {Icon && <Icon />}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }} noWrap>{title}</Typography>
          </Box>
        </Stack>

        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ minHeight: 44, mb: 1.5 }}>
            {description}
          </Typography>
        )}

        {chips.length > 0 && (
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            {chips.map((c, i) =>
              typeof c === "string"
                ? <Chip key={i} size="small" label={c} variant="outlined" />
                : <Chip key={i} size="small" {...c} />
            )}
          </Stack>
        )}

        {children}
      </CardContent>

      <Box sx={{ p: 2, pt: 0 }}>
        {primaryAction || secondaryAction ? (
          <Stack direction="row" spacing={1}>
            {primaryAction}
            {secondaryAction}
          </Stack>
        ) : to ? (
          <Button
            fullWidth
            variant="contained"
            color={accent}
            endIcon={<OpenInNewIcon />}
            component={RouterLink}
            to={to}
          >
            {buttonLabel}
          </Button>
        ) : null}
      </Box>
    </Card>
  );
}
