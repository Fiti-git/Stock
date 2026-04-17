// Backward-compat shim. The real layout lives in ./layout/AppShell.jsx.
// Existing pages do `import Layout from "../../components/Layout"` — this keeps them working.
import AppShell from "./layout/AppShell";

export default function Layout({ children }) {
  return <AppShell>{children}</AppShell>;
}
