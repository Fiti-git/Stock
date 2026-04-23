import React from "react";
import { Paper, Typography, Button, Box, Stack } from "@mui/material";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }
  reset = () => this.setState({ error: null });
  reload = () => window.location.reload();

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Box sx={{ display: "grid", placeItems: "center", minHeight: "60vh", p: 3 }}>
        <Paper sx={{ p: 4, maxWidth: 560, textAlign: "center" }}>
          <ReportProblemIcon sx={{ fontSize: 56, color: "error.main", mb: 1 }} />
          <Typography variant="h6" gutterBottom>Something went wrong</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The terminal hit an unexpected error. Your open shift is safe — try again.
          </Typography>
          <Box sx={{ fontFamily: "monospace", fontSize: 12, bgcolor: "action.hover", p: 2, borderRadius: 1, textAlign: "left", mb: 2, maxHeight: 180, overflow: "auto" }}>
            {String(this.state.error?.message || this.state.error)}
          </Box>
          <Stack direction="row" spacing={1} justifyContent="center">
            <Button variant="outlined" onClick={this.reset}>Retry</Button>
            <Button variant="contained" onClick={this.reload}>Reload page</Button>
          </Stack>
        </Paper>
      </Box>
    );
  }
}
