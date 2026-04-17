import { Box, Typography, Stack } from "@mui/material";
import InboxIcon from "@mui/icons-material/Inbox";

export default function EmptyState({ title = "No data", description, icon, action }) {
  return (
    <Stack alignItems="center" spacing={1.5} sx={{ p: 4, color: "text.secondary" }}>
      <Box sx={{ width: 56, height: 56, borderRadius: "50%", bgcolor: "action.hover", display: "grid", placeItems: "center" }}>
        {icon || <InboxIcon color="disabled" />}
      </Box>
      <Typography variant="subtitle1" color="text.primary">{title}</Typography>
      {description && <Typography variant="body2">{description}</Typography>}
      {action}
    </Stack>
  );
}
