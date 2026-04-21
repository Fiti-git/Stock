import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Stack, TextField, Button, Chip, Typography, Paper, IconButton, Tooltip,
  LinearProgress,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AssignmentIcon from "@mui/icons-material/Assignment";
import Layout from "../../components/Layout";
import { PageHeader, DataTable, ConfirmDialog } from "../../components/ui";
import { useNotify } from "../../providers/NotificationProvider";
import api from "../../api/client";
import {
  getPurchasePlan, approvePurchasePlan, updatePurchasePlan,
  updatePlanLine, deletePlanLine, planExportUrl,
} from "../../api/orgCatalog";

const STATUS_COLORS = {
  draft: "default",
  approved: "success",
  sent: "info",
  received: "primary",
  cancelled: "error",
};

export default function PurchasePlanDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [deletingLine, setDeletingLine] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await getPurchasePlan(id);
      setPlan(data);
    } catch {
      notify.error("Failed to load plan.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line

  async function handleFinalQtyChange(row, newVal) {
    try {
      const { data } = await updatePlanLine(id, row.id, { final_qty: newVal });
      setPlan((p) => ({
        ...p,
        lines: p.lines.map((l) => l.id === data.id ? { ...l, ...data } : l),
      }));
    } catch {
      notify.error("Update failed.");
    }
  }

  async function handleUnitCostChange(row, newVal) {
    try {
      const { data } = await updatePlanLine(id, row.id, { unit_cost: newVal });
      setPlan((p) => ({
        ...p,
        lines: p.lines.map((l) => l.id === data.id ? { ...l, ...data } : l),
      }));
    } catch {
      notify.error("Update failed.");
    }
  }

  async function handleDeleteLine() {
    setSaving(true);
    try {
      await deletePlanLine(id, deletingLine.id);
      setPlan((p) => ({ ...p, lines: p.lines.filter((l) => l.id !== deletingLine.id) }));
      setDeletingLine(null);
      notify.success("Line removed.");
    } catch {
      notify.error("Delete failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    try {
      const { data } = await approvePurchasePlan(id);
      setPlan(data);
      notify.success("Plan approved.");
    } catch (err) {
      notify.error(err.response?.data?.detail || "Approve failed.");
    } finally {
      setApproving(false);
    }
  }

  async function handleSetStatus(next) {
    try {
      const { data } = await updatePurchasePlan(id, { status: next });
      setPlan(data);
      notify.info(`Status → ${next}.`);
    } catch {
      notify.error("Status change failed.");
    }
  }

  async function handleExport() {
    try {
      const res = await api.get(planExportUrl(id), { responseType: "blob" });
      const blob = new Blob([res.data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plan-${id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      notify.error("Export failed.");
    }
  }

  const columns = [
    { field: "master_code", headerName: "Master", width: 140 },
    { field: "master_name", headerName: "Name", flex: 1, minWidth: 220 },
    {
      field: "outlet_name", headerName: "Outlet", width: 140,
      valueGetter: (p) => p.row.outlet_name || "(consolidated)",
    },
    { field: "suggested_qty", headerName: "Suggested", width: 110, type: "number" },
    {
      field: "final_qty", headerName: "Final Qty", width: 120, type: "number",
      editable: plan?.status === "draft",
    },
    {
      field: "unit_cost", headerName: "Unit Cost", width: 110, type: "number",
      editable: plan?.status === "draft",
    },
    {
      field: "allocation", headerName: "Allocation", width: 180,
      valueGetter: (p) => {
        const a = p.row.allocation || {};
        const keys = Object.keys(a);
        if (keys.length === 0) return "";
        return keys.map((k) => `${k}:${a[k]}`).join(", ");
      },
    },
    {
      field: "actions", headerName: "", width: 60, sortable: false, filterable: false,
      renderCell: (p) => (
        plan?.status === "draft" ? (
          <Tooltip title="Remove line">
            <IconButton size="small" color="error" onClick={() => setDeletingLine(p.row)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null
      ),
    },
  ];

  if (!plan && loading) return <Layout><LinearProgress /></Layout>;
  if (!plan) return <Layout><Typography>Plan not found.</Typography></Layout>;

  const isDraft = plan.status === "draft";
  const totalFinal = (plan.lines || []).reduce((s, l) => s + (l.final_qty || 0), 0);

  return (
    <Layout>
      <PageHeader
        title={plan.name}
        subtitle={`${plan.mode === "consolidated" ? "Consolidated" : "Per outlet"} · ${(plan.lines || []).length} lines · total ${totalFinal}`}
        icon={<AssignmentIcon />}
        actions={
          <Stack direction="row" spacing={1}>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/admin/purchase-plans")}>
              Back
            </Button>
            <Button startIcon={<DownloadIcon />} onClick={handleExport}>
              Export CSV
            </Button>
            {isDraft && (
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckCircleIcon />}
                disabled={approving}
                onClick={handleApprove}
              >
                Approve
              </Button>
            )}
            {plan.status === "approved" && (
              <Button onClick={() => handleSetStatus("sent")}>Mark Sent</Button>
            )}
            {plan.status === "sent" && (
              <Button onClick={() => handleSetStatus("received")}>Mark Received</Button>
            )}
          </Stack>
        }
      />

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
          <Info label="Status" value={
            <Chip size="small" label={plan.status} color={STATUS_COLORS[plan.status] || "default"} />
          } />
          <Info label="Supplier" value={plan.supplier_code ? `${plan.supplier_code} — ${plan.supplier_name || ""}` : "—"} />
          <Info label="Created by" value={plan.created_by_name || "—"} />
          <Info label="Created" value={new Date(plan.created_at).toLocaleString()} />
          {plan.approved_at && (
            <Info label="Approved" value={new Date(plan.approved_at).toLocaleString()} />
          )}
        </Stack>
      </Paper>

      <DataTable
        rows={plan.lines || []}
        columns={columns}
        loading={loading}
        getRowId={(r) => r.id}
        emptyText="No lines — demand snapshot may be empty"
        processRowUpdate={(updated, original) => {
          if (updated.final_qty !== original.final_qty) {
            handleFinalQtyChange(original, updated.final_qty);
          }
          if (updated.unit_cost !== original.unit_cost) {
            handleUnitCostChange(original, updated.unit_cost);
          }
          return updated;
        }}
        onProcessRowUpdateError={() => notify.error("Inline edit failed.")}
      />

      <ConfirmDialog
        open={Boolean(deletingLine)}
        onClose={() => setDeletingLine(null)}
        onConfirm={handleDeleteLine}
        loading={saving}
        title="Remove line"
        message={deletingLine ? `Remove ${deletingLine.master_code} from this plan?` : ""}
        confirmLabel="Remove"
      />
    </Layout>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
      <Typography variant="body1">{value}</Typography>
    </div>
  );
}
