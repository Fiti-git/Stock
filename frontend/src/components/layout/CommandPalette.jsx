import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, InputBase, Box, List, ListItemButton, ListItemIcon,
  ListItemText, Typography, Divider, Chip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import { useAuth } from "../../contexts/AuthContext";
import { searchableRoutes, ACTIVE_SYSTEM_STORAGE_KEY } from "../../routes/config";

/**
 * Cmd-K / Ctrl-K command palette.
 *
 * - Lists every route the user has permission for, including ones hidden
 *   from the sidebar (Upload XLS, Approvals, Stock Count, transaction
 *   sub-pages, etc.). The whole point of a palette is to reach pages
 *   that aren't in the menu.
 * - Filters by the user's active system (the STOCK/POS toggle). Cross-
 *   product routes (system: "both") show in either mode.
 * - For users with both systems, prepends a "Switch to STOCK / POS"
 *   command at the top. Selecting it flips the active system in
 *   localStorage and reloads so every consumer (sidebar, palette,
 *   page guards) re-derives from the new value.
 */
export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState(0);

  // Read active system fresh on every open — it can change between opens
  // via the sidebar toggle, and we don't want a stale snapshot.
  const activeSystem = useMemo(() => {
    if (!open) return null;
    try {
      const saved = localStorage.getItem(ACTIVE_SYSTEM_STORAGE_KEY);
      const userSystems = user?.systems || [];
      if (saved && userSystems.includes(saved)) return saved;
      return userSystems[0] || null;
    } catch {
      return user?.systems?.[0] || null;
    }
  }, [open, user]);

  const userHasBothSystems = (user?.systems || []).length > 1;
  const otherSystem = activeSystem === "stock" ? "pos" : "stock";

  // Build the searchable command list. Order: system-switch (if applicable),
  // then routes. The route list intentionally includes hidden entries so a
  // user can `Cmd-K → upload` and jump straight to /upload even though the
  // sidebar no longer surfaces it.
  const all = useMemo(() => {
    const routes = searchableRoutes(user?.permissions, activeSystem).map((r) => ({
      kind: "route",
      key: r.path,
      label: r.label,
      group: r.group,
      icon: r.icon,
      hint: r.path,
    }));
    const switchCmd = userHasBothSystems ? [{
      kind: "system",
      key: "system:switch",
      label: `Switch to ${otherSystem.toUpperCase()}`,
      group: "System",
      icon: SwapHorizIcon,
      hint: `currently ${activeSystem?.toUpperCase()}`,
    }] : [];
    return [...switchCmd, ...routes];
  }, [user?.permissions, activeSystem, userHasBothSystems, otherSystem]);

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
    if (cmd.kind === "system") {
      try { localStorage.setItem(ACTIVE_SYSTEM_STORAGE_KEY, otherSystem); } catch { /* ignore */ }
      // Hard reload so the sidebar, route guards, and page bundles pick up
      // the new active system uniformly. Switching mid-session without a
      // reload would require every consumer to subscribe to a global signal.
      window.location.reload();
      return;
    }
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
