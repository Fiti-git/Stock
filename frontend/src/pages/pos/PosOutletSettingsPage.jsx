import { useState, useEffect, useCallback } from "react";
import {
  Stack, TextField, Button, Typography, Paper, Box, Alert,
} from "@mui/material";
import StorefrontIcon from "@mui/icons-material/Storefront";
import SaveIcon from "@mui/icons-material/Save";
import Layout from "../../components/Layout";
import { PageHeader } from "../../components/ui";
import { getOutletSettings, updateOutletSettings } from "../../api/pos";
import { useOutlet } from "../../contexts/OutletContext";
import { useNotification } from "../../providers/NotificationProvider";

export default function PosOutletSettingsPage() {
  const { outletId } = useOutlet();
  const { notify } = useNotification();
  const [data, setData] = useState(null);
  const [form, setForm] = useState({
    address: "", phone: "", tax_reg_no: "", receipt_footer: "",
    lankaqr_merchant_id: "", lankaqr_merchant_name: "",
  });
  const [logoFile, setLogoFile] = useState(null);
  const [qrFile, setQrFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!outletId) return;
    try {
      const res = await getOutletSettings(outletId);
      setData(res.data);
      setForm({
        address: res.data.address || "",
        phone: res.data.phone || "",
        tax_reg_no: res.data.tax_reg_no || "",
        receipt_footer: res.data.receipt_footer || "",
        lankaqr_merchant_id: res.data.lankaqr_merchant_id || "",
        lankaqr_merchant_name: res.data.lankaqr_merchant_name || "",
      });
    } catch (err) {
      notify(err?.response?.data?.detail || "Failed to load.", "error");
    }
  }, [outletId, notify]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!outletId) return;
    setSaving(true);
    try {
      if (logoFile || qrFile) {
        const fd = new FormData();
        Object.entries(form).forEach(([k, v]) => fd.append(k, v));
        if (logoFile) fd.append("logo", logoFile);
        if (qrFile) fd.append("lankaqr_static_qr", qrFile);
        await updateOutletSettings(outletId, fd);
      } else {
        await updateOutletSettings(outletId, form);
      }
      notify("Settings saved.", "success");
      setLogoFile(null); setQrFile(null);
      load();
    } catch (err) {
      notify(err?.response?.data?.detail || "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!outletId) {
    return (
      <Layout>
        <PageHeader title="Outlet Settings" icon={<StorefrontIcon />} />
        <Alert severity="info">Select an outlet in the top bar.</Alert>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader title="Outlet Settings" subtitle="Receipt header and LankaQR" icon={<StorefrontIcon />} />
      {data && (
        <Paper sx={{ p: 3, maxWidth: 720 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>{data.outlet_name}</Typography>
          <Stack spacing={2}>
            <TextField label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} multiline minRows={2} />
            <TextField label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <TextField label="Tax registration no." value={form.tax_reg_no} onChange={(e) => setForm({ ...form, tax_reg_no: e.target.value })} />
            <TextField label="Receipt footer" value={form.receipt_footer} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} helperText="Shown at bottom of every receipt" />

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Logo (optional)</Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                {data.logo_url && <img src={data.logo_url} alt="logo" style={{ maxHeight: 80 }} />}
                <Button component="label" variant="outlined">
                  {logoFile ? logoFile.name : "Upload logo"}
                  <input type="file" accept="image/*" hidden onChange={(e) => setLogoFile(e.target.files[0])} />
                </Button>
              </Stack>
            </Box>

            <Typography variant="h6" sx={{ mt: 2 }}>LankaQR</Typography>
            <TextField label="Merchant ID" value={form.lankaqr_merchant_id} onChange={(e) => setForm({ ...form, lankaqr_merchant_id: e.target.value })} />
            <TextField label="Merchant name" value={form.lankaqr_merchant_name} onChange={(e) => setForm({ ...form, lankaqr_merchant_name: e.target.value })} />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Static QR image</Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                {data.lankaqr_static_qr_url && <img src={data.lankaqr_static_qr_url} alt="QR" style={{ maxHeight: 120 }} />}
                <Button component="label" variant="outlined">
                  {qrFile ? qrFile.name : "Upload QR image"}
                  <input type="file" accept="image/*" hidden onChange={(e) => setQrFile(e.target.files[0])} />
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Upload the QR image provided by your bank. Shown on screen when cashier selects "LankaQR" as tender.
              </Typography>
            </Box>

            <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving} sx={{ alignSelf: "flex-start" }}>
              Save
            </Button>
          </Stack>
        </Paper>
      )}
    </Layout>
  );
}
