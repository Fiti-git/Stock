import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, InputBase, Box, List, ListItemButton, ListItemIcon,
  ListItemText, Typography, Divider, Chip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useAuth } from "../../contexts/AuthContext";
import { searchableRoutes, ACTIVE_SYSTEM_STORAGE_KEY } from "../../routes/config";

/**
 * Cmd-K / Ctrl-K command palette.
 *
 * Searches only within the user's currently active app (stock / pos /
 * ecom / admin). To jump into another app, the user goes back to the
 * launcher — the palette intentionally does NOT cross app boundaries.
 * Hidden-from-sidebar routes are still indexed (e.g. Upload XLS,
 * transaction sub-pages) so the palette remains the fastest way to
 * reach them inside the current app.
 */
export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState(0);

  // Read active system fresh on every open so a freshly-picked launcher
  // choice is reflected without remounting the palette.
  const activeSystem = useMemo(() => {
    if (!open) return null;
    try {
      return localStorage.getItem(ACTIVE_SYSTEM_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  }, [open]);

  const all = useMemo(() => {
    return searchableRoutes(user?.permissions, activeSystem).map((r) => ({
      kind: "route",
      key: r.path,
      label: r.label,
      group: r.group,
      icon: r.icon,
      hint: r.path,
    }));
  }, [user?.permissions, activeSystem]);

  const results = useMemo(() => {
    if (!query) return all.slice(0, 12);
    const q = query.toLowerCase();
    return all
      .filter((r) =>
        r.label.toLowerCase().includes(q) ||
        (r.hint || "").toLowerCase().includes(q) ||
        (r.group || "").toLowerCase().includes(q)
      )
      .slice(0, 14);
  }, [query, all]);

  useEffect(() => { if (open) { setQuery(""); setHover(0); } }, [open]);

  const select = (cmd) => {
    onClose?.();
    navigate(cmd.key);
  };

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
            else if (e.key === "Enter" && results[hover]) { e.preventDefault(); select(results[hover]); }
          }}
          sx={{ fontSize: "0.95rem" }}
        />
        {activeSystem && (
          <Chip
            size="small"
            label={activeSystem.toUpperCase()}
            color={activeSystem === "stock" ? "primary" : "secondary"}
            sx={{ mr: 1, fontWeight: 700, letterSpacing: "0.06em" }}
          />
        )}
        <Box component="kbd" sx={{ px: 0.75, fontSize: "0.7rem", color: "text.secondary", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>ESC</Box>
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
                  key={r.key}
                  selected={i === hover}
                  onMouseEnter={() => setHover(i)}
                  onClick={() => select(r)}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>{Icon ? <Icon fontSize="small" /> : null}</ListItemIcon>
                  <ListItemText
                    primary={r.label}
                    secondary={r.group}
                    primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: 500 }}
                    secondaryTypographyProps={{ fontSize: "0.72rem" }}
                  />
                  <Typography variant="caption" color="text.secondary">{r.hint}</Typography>
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
