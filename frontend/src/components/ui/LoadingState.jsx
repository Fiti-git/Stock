import { Box, CircularProgress, Typography, Stack } from "@mui/material";

export default function LoadingState({ message = "Loading…", size = 28, sx }) {
  return (
    <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ p: 4, ...sx }}>
      <CircularProgress size={size} />
      {message && <Typography variant="body2" color="text.secondary">{message}</Typography>}
    </Stack>
  );
}
