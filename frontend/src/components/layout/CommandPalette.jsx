import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, InputBase, Box, List, ListItemButton, ListItemIcon,
  ListItemText, Typography, Divider,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useAuth } from "../../contexts/AuthContext";
import { routesForPermissions } from "../../routes/config";

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState(0);

  const all = useMemo(() => routesForPermissions(user?.permissions), [user?.permissions]);
  const results = useMemo(() => {
    if (!query) return all.slice(0, 10);
    const q = query.toLowerCase();
    return all
      .filter((r) => r.label.toLowerCase().includes(q) || r.path.toLowerCase().includes(q) || (r.group || "").toLowerCase().includes(q))
      .slice(0, 12);
  }, [query, all]);

  useEffect(() => { if (open) { setQuery(""); setHover(0); } }, [open]);

  const go = (r) => { onClose?.(); navigate(r.path); };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { mt: 10, alignSelf: "flex-start" } }}
    >
      <Box sx={{ display: "flex", alignItems: "center", px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <SearchIcon sx={{ color: "text.secondary", mr: 1 }} />
        <InputBase
          autoFocus
          fullWidth
          placeholder="Jump to page, search…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHover(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHover((h) => Math.min(h + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHover((h) => Math.max(h - 1, 0)); }
            else if (e.key === "Enter" && results[hover]) { e.preventDefault(); go(results[hover]); }
          }}
          sx={{ fontSize: "0.95rem" }}
        />
        <Box component="kbd" sx={{ ml: 1, px: 0.75, fontSize: "0.7rem", color: "text.secondary", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>ESC</Box>
      </Box>
      <DialogContent sx={{ p: 0, maxHeight: 400 }}>
        {results.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center", color: "text.secondary" }}>
            <Typography variant="body2">No results</Typography>
          </Box>
        ) : (
          <List dense disablePadding>
            {results.map((r, i) => {
              const Icon = r.icon;
              return (
                <ListItemButton
                  key={r.path}
                  selected={i === hover}
                  onMouseEnter={() => setHover(i)}
                  onClick={() => go(r)}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>{Icon ? <Icon fontSize="small" /> : null}</ListItemIcon>
                  <ListItemText
                    primary={r.label}
                    secondary={r.group}
                    primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 500 }}
                    secondaryTypographyProps={{ fontSize: "0.72rem" }}
                  />
                  <Typography variant="caption" color="text.secondary">{r.path}</Typography>
                </ListItemButton>
              );
            })}
          </List>
        )}
        <Divider />
        <Box sx={{ px: 2, py: 1, display: "flex", gap: 2, color: "text.secondary", fontSize: "0.72rem" }}>
          <span>↑↓ navigate</span>
          <span>⏎ select</span>
          <span>esc close</span>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
