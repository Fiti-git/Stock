import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import {
  getLicenseConfig,
  saveLicenseConfig,
  testLicenseConnection,
  getLicenseAudit,
} from "../../api/license";

export default function LicenseConfiguration() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [auditLogs, setAuditLogs] = useState([]);
  const [showAudit, setShowAudit] = useState(false);
  const [editing, setEditing] = useState(false);

  const [form, setForm] = useState({
    instance_id: "",
    instance_secret: "",
    license_server_url: "",
    license_public_key_pem: "",
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const { data } = await getLicenseConfig();
      if (data.configured === false) {
        setConfig(null);
        setEditing(true);
      } else {
        setConfig(data);
        setForm({
          instance_id: data.instance_id || "",
          instance_secret: "",
          license_server_url: data.license_server_url || "",
          license_public_key_pem: data.license_public_key_pem || "",
        });
      }
    } catch {
      setError("Failed to load license configuration.");
    }
    setLoading(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError("");
    try {
      const payload = { ...form };
      if (!payload.instance_secret) payload.instance_secret = "********";
      const { data } = await testLicenseConnection(payload);
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, error: err.response?.data?.error || err.message });
    }
    setTesting(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = { ...form };
      if (!payload.instance_secret) payload.instance_secret = "********";
      await saveLicenseConfig(payload);
      setSuccess("License configuration saved successfully.");
      setEditing(false);
      fetchConfig();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save configuration.");
    }
    setSaving(false);
  };

  const fetchAudit = async () => {
    try {
      const { data } = await getLicenseAudit();
      setAuditLogs(data);
      setShowAudit(true);
    } catch {
      setError("Failed to load audit log.");
    }
  };

  const handleChange = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-20 text-gray-400">Loading…</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">License Configuration</h1>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">{success}</div>}

        {/* Current config display */}
        {config && !editing && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-700">Current Configuration</h2>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">Configured</span>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                <tr><td className="py-2 font-medium text-gray-500 w-40">Instance ID</td><td className="py-2 font-mono text-gray-800">{config.instance_id}</td></tr>
                <tr><td className="py-2 font-medium text-gray-500">Instance Secret</td><td className="py-2 text-gray-400">********</td></tr>
                <tr><td className="py-2 font-medium text-gray-500">License Server</td><td className="py-2 text-gray-800">{config.license_server_url}</td></tr>
                <tr><td className="py-2 font-medium text-gray-500">Configured At</td><td className="py-2 text-gray-800">{new Date(config.configured_at).toLocaleString()}</td></tr>
                <tr><td className="py-2 font-medium text-gray-500">Configured By</td><td className="py-2 text-gray-800">{config.configured_by_name || "—"}</td></tr>
              </tbody>
            </table>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditing(true)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Update</button>
              <button onClick={handleTest} disabled={testing} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                {testing ? "Testing…" : "Test Connection"}
              </button>
              <button onClick={fetchAudit} className="px-4 py-2 text-sm text-brand-600 hover:underline">View Audit Log</button>
            </div>
          </div>
        )}

        {/* Test result */}
        {testResult && (
          <div className={`px-4 py-3 rounded-lg mb-4 ${testResult.success ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
            {testResult.success
              ? `Connected! Client: ${testResult.client_name}, State: ${testResult.state}, Features: ${testResult.features?.length || 0}`
              : `Failed: ${testResult.error}`}
          </div>
        )}

        {/* Edit form */}
        {editing && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-1">{config ? "Update License" : "Set Up License"}</h2>
            <p className="text-sm text-gray-400 mb-4">
              {config ? "Leave secret blank to keep current value." : "Enter credentials from your service provider."}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Instance ID</label>
                <input value={form.instance_id} onChange={handleChange("instance_id")} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Instance Secret</label>
                <input type="password" value={form.instance_secret} onChange={handleChange("instance_secret")} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent" placeholder={config ? "Leave blank to keep current" : "Paste your instance secret"} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">License Server URL</label>
                <input value={form.license_server_url} onChange={handleChange("license_server_url")} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent" placeholder="https://licenses.fiti.solutions" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">License Public Key (PEM)</label>
                <textarea rows={5} value={form.license_public_key_pem} onChange={handleChange("license_public_key_pem")} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-brand-500 focus:border-transparent" placeholder="-----BEGIN PUBLIC KEY-----" />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={handleTest} disabled={testing} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">
                {testing ? "Testing…" : "Test Connection"}
              </button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save Configuration"}
              </button>
              {config && <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-gray-500 hover:underline">Cancel</button>}
            </div>
          </div>
        )}

        {/* Audit log */}
        {showAudit && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-3">Audit Log</h2>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Action</th>
                    <th className="px-4 py-2 text-left">User</th>
                    <th className="px-4 py-2 text-left">Fields</th>
                    <th className="px-4 py-2 text-left">OK</th>
                    <th className="px-4 py-2 text-left">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-2"><span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">{log.action}</span></td>
                      <td className="px-4 py-2">{log.actor_name || "—"}</td>
                      <td className="px-4 py-2 text-gray-400">{log.fields_changed?.join(", ") || "—"}</td>
                      <td className="px-4 py-2">{log.success ? "Yes" : "No"}</td>
                      <td className="px-4 py-2 text-gray-400">{new Date(log.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No audit entries.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
