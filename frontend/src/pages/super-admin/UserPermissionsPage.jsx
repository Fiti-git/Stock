import { useEffect, useMemo, useState } from "react";
import {
  Stack, Box, Paper, Typography, TextField, MenuItem, Button, Checkbox,
  FormControlLabel, Divider, Chip, CircularProgress, Alert, Tooltip,
} from "@mui/material";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SaveIcon from "@mui/icons-material/Save";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import { getUsers } from "../../api/users";
import {
  getPermissionRegistry,
  getUserPermissions,
  updateUserPermissions,
} from "../../api/permissions";

/**
 * Super-admin-only page: pick a user and toggle their effective permissions
 * per code. Saving writes the explicit override; "Reset to role defaults"
 * clears the override so the user once again inherits the role baseline.
 */
export default function UserPermissionsPage() {
  const notify = useNotify();

  const [users, setUsers] = useState([]);
  const [registry, setRegistry] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedUserId, setSelectedUserId] = useState("");
  const [detail, setDetail] = useState(null); // {id, username, role, permissions_override, effective_permissions, systems}
  const [draftCodes, setDraftCodes] = useState(new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  // System filter — narrows the visible permission rows to one product.
  // "all" shows everything; "stock"/"pos" hides codes tagged for the other product.
  // Cross-product codes (system: "both") always remain visible.
  const [systemFilter, setSystemFilter] = useState("all");

  useEffect(() => {
    Promise.all([getUsers(), getPermissionRegistry()])
      .then(([u, r]) => {
        // Exclude Super Admins — they're not editable (always full perms).
        setUsers(u.data.filter((x) => x.role !== "super_admin"));
        setRegistry(r.data.permissions || []);
      })
      .catch(() => notify.error("Failed to load users or permission registry."))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!selectedUserId) {
      setDetail(null);
      setDraftCodes(new Set());
      setDirty(false);
      return;
    }
    setDetailLoading(true);
    getUserPermissions(selectedUserId)
      .then(({ data }) => {
        setDetail(data);
        setDraftCodes(new Set(data.effective_permissions || []));
        setDirty(false);
      })
      .catch(() => notify.error("Failed to load user permissions."))
      .finally(() => setDetailLoading(false));
  }, [selectedUserId]); // eslint-disable-line

  // Categories filtered by the active system chip. "both" codes always show
  // regardless of filter, so picking "stock" still surfaces shared admin
  // pages (Users, Audit Log) the super admin needs to grant.
  const categories = useMemo(() => {
    const visible = registry.filter((p) => {
      if (systemFilter === "all") return true;
      return !p.system || p.system === "both" || p.system === systemFilter;
    });
    const map = new Map();
    for (const p of visible) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category).push(p);
    }
    return Array.from(map.entries());
  }, [registry, systemFilter]);

  // Codes per system — used by the "Grant all STOCK / POS" bulk buttons.
  const codesBySystem = useMemo(() => {
    const out = { stock: [], pos: [], both: [] };
    for (const p of registry) {
      const s = p.system || "both";
      if (out[s]) out[s].push(p.code);
    }
    return out;
  }, [registry]);

  const grantSystem = (system) => {
    setDraftCodes((prev) => {
      const next = new Set(prev);
      for (const c of codesBySystem[system] || []) next.add(c);
      return next;
    });
    setDirty(true);
  };

  const revokeSystem = (system) => {
    setDraftCodes((prev) => {
      const next = new Set(prev);
      for (const c of codesBySystem[system] || []) next.delete(c);
      return next;
    });
    setDirty(true);
  };

  const toggle = (code) => {
    setDraftCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    setDirty(true);
  };

  const selectAllInCategory = (items, value) => {
    setDraftCodes((prev) => {
      const next = new Set(prev);
      for (const p of items) {
        if (value) next.add(p.code);
        else next.delete(p.code);
      }
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const { data } = await updateUserPermissions(detail.id, Array.from(draftCodes));
      setDetail(data);
      setDraftCodes(new Set(data.effective_permissions || []));
      setDirty(false);
      notify.success(`Permissions updated for ${data.username}.`);
    } catch (err) {
      notify.error(err.response?.data?.detail || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const resetToRoleDefaults = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const { data } = await updateUserPermissions(detail.id, null);
      setDetail(data);
      setDraftCodes(new Set(data.effective_permissions || []));
      setDirty(false);
      notify.success(`Reset ${data.username} to role defaults.`);
    } catch (err) {
      notify.error(err.response?.data?.detail || "Reset failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="User Permissions"
        subtitle="Super Admin only · toggle sidebar items and actions per user"
        icon={<AdminPanelSettingsIcon />}
      />

      <Stack spacing={2}>
        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <TextField
              select
              label="Select user"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              sx={{ minWidth: 280 }}
              disabled={loading}
            >
              <MenuItem value="">— Choose a user —</MenuItem>
              {users.map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.username} · {u.role}
                  {u.permissions_overridden ? " · custom" : ""}
                </MenuItem>
              ))}
            </TextField>

            {detail && (
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" label={`Role: ${detail.role}`} />
                <Chip
                  size="small"
                  color={detail.permissions_override === null ? "default" : "warning"}
                  label={
                    detail.permissions_override === null
                      ? "Using role defaults"
                      : "Custom override active"
                  }
                />
                <Chip size="small" label={`${draftCodes.size} granted`} />
                {(detail.systems || []).map((s) => (
                  <Chip
                    key={s}
                    size="small"
                    color={s === "stock" ? "primary" : "secondary"}
                    label={s.toUpperCase()}
                    variant="filled"
                  />
                ))}
              </Stack>
            )}
          </Stack>

          {loading && (
            <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
              <CircularProgress size={20} />
            </Box>
          )}
        </Paper>

        {detail && (
          <>
            <Alert severity="info" variant="outlined">
              Unchecked sidebar items disappear from this user's navigation and their
              corresponding routes become inaccessible. Action permissions (e.g. "Delete
              items") gate individual buttons and API endpoints.
            </Alert>

            {detailLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Stack spacing={2}>
                <Paper sx={{ p: 2 }}>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={2}
                    alignItems={{ md: "center" }}
                    justifyContent="space-between"
                  >
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="body2" sx={{ fontWeight: 600, mr: 1 }}>
                        System:
                      </Typography>
                      {[
                        { key: "all",   label: "All" },
                        { key: "stock", label: "STOCK" },
                        { key: "pos",   label: "POS" },
                      ].map((opt) => (
                        <Chip
                          key={opt.key}
                          label={opt.label}
                          size="small"
                          clickable
                          color={systemFilter === opt.key ? "primary" : "default"}
                          variant={systemFilter === opt.key ? "filled" : "outlined"}
                          onClick={() => setSystemFilter(opt.key)}
                        />
                      ))}
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Tooltip title={`Tick every Stock-tagged code (${codesBySystem.stock.length})`}>
                        <Button
                          size="small"
                          variant="outlined"
                          color="primary"
                          onClick={() => grantSystem("stock")}
                        >
                          Grant all STOCK
                        </Button>
                      </Tooltip>
                      <Tooltip title={`Untick every Stock-tagged code`}>
                        <Button
                          size="small"
                          variant="text"
                          color="primary"
                          onClick={() => revokeSystem("stock")}
                        >
                          Revoke STOCK
                        </Button>
                      </Tooltip>
                      <Tooltip title={`Tick every POS-tagged code (${codesBySystem.pos.length})`}>
                        <Button
                          size="small"
                          variant="outlined"
                          color="secondary"
                          onClick={() => grantSystem("pos")}
                        >
                          Grant all POS
                        </Button>
                      </Tooltip>
                      <Tooltip title={`Untick every POS-tagged code`}>
                        <Button
                          size="small"
                          variant="text"
                          color="secondary"
                          onClick={() => revokeSystem("pos")}
                        >
                          Revoke POS
                        </Button>
                      </Tooltip>
                    </Stack>
                  </Stack>
                </Paper>

                {categories.map(([cat, items]) => {
                  const allOn = items.every((p) => draftCodes.has(p.code));
                  const noneOn = items.every((p) => !draftCodes.has(p.code));
                  return (
                    <Paper key={cat} sx={{ p: 2 }}>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="center"
                        sx={{ mb: 1 }}
                      >
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {cat}
                        </Typography>
                        <Stack direction="row" spacing={1}>
                          <Button
                            size="small"
                            variant="text"
                            disabled={allOn}
                            onClick={() => selectAllInCategory(items, true)}
                          >
                            All
                          </Button>
                          <Button
                            size="small"
                            variant="text"
                            disabled={noneOn}
                            onClick={() => selectAllInCategory(items, false)}
                          >
                            None
                          </Button>
                        </Stack>
                      </Stack>
                      <Divider sx={{ mb: 1 }} />
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" },
                          gap: 0.5,
                        }}
                      >
                        {items.map((p) => (
                          <Tooltip key={p.code} title={p.code} placement="top-start">
                            <FormControlLabel
                              control={
                                <Checkbox
                                  size="small"
                                  checked={draftCodes.has(p.code)}
                                  onChange={() => toggle(p.code)}
                                />
                              }
                              label={p.label}
                            />
                          </Tooltip>
                        ))}
                      </Box>
                    </Paper>
                  );
                })}

                <Paper sx={{ p: 2, position: "sticky", bottom: 0 }}>
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button
                      variant="outlined"
                      color="warning"
                      startIcon={<RestartAltIcon />}
                      onClick={resetToRoleDefaults}
                      disabled={saving || detail.permissions_override === null}
                    >
                      Reset to role defaults
                    </Button>
                    <Button
                      variant="contained"
                      startIcon={<SaveIcon />}
                      onClick={save}
                      disabled={saving || !dirty}
                    >
                      Save
                    </Button>
                  </Stack>
                </Paper>
              </Stack>
            )}
          </>
        )}
      </Stack>
    </Layout>
  );
}
