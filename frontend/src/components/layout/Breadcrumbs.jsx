import { Link, useLocation } from "react-router-dom";
import { Breadcrumbs as MuiBreadcrumbs, Typography, Link as MuiLink } from "@mui/material";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import HomeIcon from "@mui/icons-material/Home";
import { findRoute } from "../../routes/config";

export default function Breadcrumbs() {
  const location = useLocation();
  const parts = location.pathname.split("/").filter(Boolean);
  const crumbs = parts.map((_, idx) => {
    const path = "/" + parts.slice(0, idx + 1).join("/");
    const route = findRoute(path);
    return { path, label: route?.label || decodeURIComponent(parts[idx]) };
  });

  return (
    <MuiBreadcrumbs
      separator={<NavigateNextIcon fontSize="small" />}
      sx={{ "& .MuiBreadcrumbs-separator": { mx: 0.5, color: "text.disabled" } }}
    >
      <MuiLink component={Link} to="/" underline="hover" color="text.secondary" sx={{ display: "flex", alignItems: "center" }}>
        <HomeIcon sx={{ fontSize: 16, mr: 0.5 }} />
        Home
      </MuiLink>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return last ? (
          <Typography key={c.path} color="text.primary" variant="body2" fontWeight={600}>
            {c.label}
          </Typography>
        ) : (
          <MuiLink key={c.path} component={Link} to={c.path} underline="hover" color="text.secondary" variant="body2">
            {c.label}
          </MuiLink>
        );
      })}
    </MuiBreadcrumbs>
  );
}
