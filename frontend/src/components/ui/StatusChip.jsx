import { Chip } from "@mui/material";

const MAP = {
  approved: { label: "Approved", color: "success" },
  pending:  { label: "Pending",  color: "warning" },
  rejected: { label: "Rejected", color: "error" },
  success:  { label: "Success",  color: "success" },
  failed:   { label: "Failed",   color: "error" },
  active:   { label: "Active",   color: "success" },
  inactive: { label: "Inactive", color: "default" },
  admin:    { label: "Admin",    color: "primary" },
  manager:  { label: "Manager",  color: "info" },
  store_user:{ label: "Store User", color: "default" },
  staff:    { label: "Staff",    color: "default" },
  ServiceProvider:{ label: "Service Provider", color: "secondary" },
};

export default function StatusChip({ status, label, color, ...rest }) {
  const cfg = MAP[status] || { label: label || status, color: color || "default" };
  return <Chip size="small" variant="outlined" label={cfg.label} color={cfg.color} {...rest} />;
}
