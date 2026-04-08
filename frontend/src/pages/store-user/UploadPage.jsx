import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { useAuth } from "../../contexts/AuthContext";
import { validateUpload, confirmUpload } from "../../api/uploads";
import { getOutlets } from "../../api/outlets";

const STEPS = {
  DATE_SELECT: "date_select",
  OUTLET_SELECT: "outlet_select",
  IDLE: "idle",
  FILE_PREVIEW: "file_preview",
  VALIDATING: "validating",
  PREVIEW: "preview",
  UPLOADING: "uploading",
  DONE: "done",
};

export default function UploadPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const now = new Date();
  const todayISO = now.toLocaleDateString("en-CA");

  const [step, setStep] = useState(STEPS.DATE_SELECT);
  const [uploadDate, setUploadDate] = useState(todayISO);
  const [file, setFile] = useState(null);
  const [rawRows, setRawRows] = useState([]); // first 50 rows from SheetJS
  const [validation, setValidation] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  // Outlet selection state
  const [outlets, setOutlets] = useState([]);
  const [selectedOutlet, setSelectedOutlet] = useState(
    isAdmin ? null : { id: user?.outlet_id, name: user?.outlet_name }
  );

  useEffect(() => {
    if (isAdmin) {
      getOutlets().then(({ data }) => setOutlets(data)).catch(() => {});
    }
  }, [isAdmin]);

  const today = now.toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const uploadTime = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  // Parse XLS client-side and return first 50 rows as array-of-arrays
  const parseRawRows = (f) =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          resolve(data.slice(0, 50));
        } catch {
          resolve([]);
        }
      };
      reader.readAsArrayBuffer(f);
    });

  const handleFileChosen = useCallback(async (f) => {
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["xls", "xlsx"].includes(ext)) {
      setError("Only .xls and .xlsx files are accepted.");
      return;
    }
    setError("");
    setFile(f);
    const rows = await parseRawRows(f);
    setRawRows(rows);
    setStep(STEPS.FILE_PREVIEW);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    handleFileChosen(e.dataTransfer.files[0]);
  }, [handleFileChosen]);

  const handleRemoveFile = () => {
    setFile(null);
    setRawRows([]);
    setStep(STEPS.IDLE);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleProceedToValidate = async () => {
    setStep(STEPS.VALIDATING);
    try {
      const { data } = await validateUpload(file, uploadDate, isAdmin ? selectedOutlet?.id : null);
      setValidation(data);
      setStep(STEPS.PREVIEW);
    } catch (err) {
      setError(err.response?.data?.detail || "Validation failed.");
      setStep(STEPS.FILE_PREVIEW);
    }
  };

  const handleConfirm = async (overwrite = false) => {
    setStep(STEPS.UPLOADING);
    setError("");
    try {
      const { data } = await confirmUpload(file, overwrite, uploadDate, isAdmin ? selectedOutlet?.id : null);
      setResult(data);
      setStep(STEPS.DONE);
    } catch (err) {
      if (err.response?.status === 409) {
        setError("A successful upload already exists for this date.");
        setStep(STEPS.PREVIEW);
      } else {
        setError(err.response?.data?.detail || "Upload failed.");
        setStep(STEPS.PREVIEW);
      }
    }
  };

  const reset = () => {
    setStep(STEPS.DATE_SELECT);
    setUploadDate(todayISO);
    setFile(null);
    setRawRows([]);
    setValidation(null);
    setResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
    if (!isAdmin) setSelectedOutlet({ id: user?.outlet_id, name: user?.outlet_name });
    else setSelectedOutlet(null);
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Upload Daily Stock</h1>
          <p className="text-sm text-gray-500 mt-1">
            <span className="font-medium text-gray-700">{user?.username}</span>
            &nbsp;·&nbsp;
            <span className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono">{today}</span>
            &nbsp;·&nbsp;
            <Link to="/upload/history" className="text-brand-600 hover:underline text-xs">
              View history
            </Link>
          </p>
        </div>

        {/* Step: DATE_SELECT */}
        {step === STEPS.DATE_SELECT && (
          <div className="bg-white border rounded-xl p-6 shadow-sm space-y-5">
            <div>
              <h2 className="font-semibold text-gray-900 mb-1">Select Upload Date</h2>
              <p className="text-sm text-gray-500">Choose the date this stock data is for.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Stock date</label>
              <input
                type="date"
                value={uploadDate}
                max={todayISO}
                onChange={(e) => setUploadDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
            {uploadDate !== todayISO && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <span>Past-date uploads require <strong>admin approval</strong> before taking effect.</span>
              </div>
            )}
            <button
              onClick={() => setStep(STEPS.OUTLET_SELECT)}
              disabled={!uploadDate}
              className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors"
            >
              Continue →
            </button>
          </div>
        )}

        {/* Step: OUTLET_SELECT */}
        {step === STEPS.OUTLET_SELECT && (
          <div className="bg-white border rounded-xl p-6 shadow-sm space-y-5">
            <div>
              <h2 className="font-semibold text-gray-900 mb-1">Select Outlet</h2>
              <p className="text-sm text-gray-500">
                {isAdmin
                  ? "Choose which outlet this XLS file belongs to."
                  : "Confirm the outlet for this upload."}
              </p>
            </div>

            {isAdmin ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Outlet</label>
                <select
                  value={selectedOutlet?.id ?? ""}
                  onChange={(e) => {
                    const found = outlets.find((o) => o.id === Number(e.target.value));
                    setSelectedOutlet(found ? { id: found.id, name: found.outlet_name } : null);
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  <option value="">— select an outlet —</option>
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>{o.outlet_name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <div>
                  <p className="text-xs text-gray-500">Your outlet</p>
                  <p className="text-sm font-semibold text-gray-800">{selectedOutlet?.name ?? user?.outlet_name ?? "—"}</p>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(STEPS.DATE_SELECT)}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(STEPS.IDLE)}
                disabled={!selectedOutlet?.id}
                className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step: IDLE or VALIDATING — drop zone */}
        {(step === STEPS.IDLE || step === STEPS.VALIDATING) && (
          <div>
            {/* Selected outlet badge */}
            <div className="flex items-center gap-2 mb-3 text-sm text-gray-600">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
              </svg>
              <span>Uploading to: <strong className="text-gray-800">{selectedOutlet?.name}</strong></span>
              <button
                type="button"
                onClick={() => setStep(STEPS.OUTLET_SELECT)}
                className="text-brand-600 hover:underline text-xs ml-1"
              >
                Change
              </button>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${
                dragging
                  ? "border-brand-500 bg-brand-50"
                  : "border-gray-300 hover:border-brand-400 hover:bg-gray-50"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xls,.xlsx"
                className="hidden"
                onChange={(e) => handleFileChosen(e.target.files[0])}
              />
              {step === STEPS.VALIDATING ? (
                <div className="text-brand-600 text-sm font-medium animate-pulse">Validating file…</div>
              ) : (
                <>
                  <svg className="mx-auto w-12 h-12 text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm font-medium text-gray-700">
                    Drop your XLS file here or <span className="text-brand-600">browse</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">.xls and .xlsx accepted</p>
                  <p className="text-xs text-gray-500 mt-3">
                    Stock date: <span className="font-semibold text-gray-700">{uploadDate}</span>
                    {" · "}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setStep(STEPS.DATE_SELECT); }}
                      className="text-brand-600 hover:underline"
                    >
                      Change
                    </button>
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {error && <div className="mt-4"><Alert type="error">{error}</Alert></div>}

        {/* Step: FILE_PREVIEW — raw 50-row table */}
        {step === STEPS.FILE_PREVIEW && (
          <div className="space-y-4">
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900">File Preview</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Showing first {rawRows.length} rows of{" "}
                    <span className="font-mono font-medium">{file?.name}</span>
                    {" · "}Outlet: <strong>{selectedOutlet?.name}</strong>
                  </p>
                </div>
              </div>

              {rawRows.length > 0 ? (
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="min-w-full text-xs">
                    <tbody>
                      {rawRows.map((row, ri) => (
                        <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-3 py-1.5 border-b border-gray-100 whitespace-nowrap text-gray-700 max-w-[180px] truncate">
                              {String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">Could not read file contents.</p>
              )}
            </div>

            {error && <Alert type="error">{error}</Alert>}

            <div className="flex gap-3">
              <button
                onClick={handleRemoveFile}
                className="flex-1 py-2.5 border border-red-300 text-red-600 rounded-lg text-sm hover:bg-red-50 transition-colors font-medium"
              >
                Remove file
              </button>
              <button
                onClick={handleProceedToValidate}
                className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg text-sm transition-colors"
              >
                Looks good — Validate →
              </button>
            </div>
          </div>
        )}

        {/* Step: PREVIEW — backend validation result */}
        {step === STEPS.PREVIEW && validation && (
          <div className="space-y-4">
            <div className="bg-white border rounded-xl p-5 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-4">Validation Result</h2>

              {/* Outlet mismatch — hard stop */}
              {validation.outlet_mismatch && (
                <div className="flex items-start gap-3 bg-red-50 border-2 border-red-400 rounded-lg p-4 mb-3">
                  <svg className="w-5 h-5 mt-0.5 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  <div>
                    <p className="font-semibold text-red-700 text-sm">Wrong outlet file — upload blocked</p>
                    <p className="text-red-600 text-sm mt-0.5">
                      This file is for <strong>{validation.outlet_mismatch.found}</strong> but you are uploading to{" "}
                      <strong>{validation.outlet_mismatch.expected}</strong>.
                    </p>
                    <p className="text-red-500 text-xs mt-1">
                      Please select the correct file for <strong>{validation.outlet_mismatch.expected}</strong>.
                    </p>
                  </div>
                </div>
              )}

              {/* Other validation errors */}
              {!validation.valid && !validation.outlet_mismatch && (
                <Alert type="error">
                  <ul className="space-y-1">
                    {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </Alert>
              )}

              {/* Warnings */}
              {validation.warnings?.length > 0 && (
                <Alert type="warning">
                  {validation.warnings.map((w, i) => <p key={i}>{w}</p>)}
                </Alert>
              )}

              {/* Past date */}
              {validation.needs_approval && (
                <Alert type="warning">
                  This file is dated <strong>{validation.preview?.snapshot_date}</strong> (not today).
                  It will be submitted for admin approval before taking effect.
                </Alert>
              )}

              {/* Duplicate */}
              {validation.duplicate && !validation.needs_approval && (
                isAdmin ? (
                  <Alert type="warning">
                    A successful upload already exists for this date. As admin, you can override and overwrite it.
                  </Alert>
                ) : (
                  <Alert type="error">
                    An upload already exists for today. Only an admin can override this.
                  </Alert>
                )
              )}

              {/* Stats */}
              {validation.valid && validation.preview && (
                <div className="grid grid-cols-4 gap-3 mt-4">
                  {[
                    { label: "Total items", value: validation.preview.total_rows },
                    { label: "Matched", value: validation.preview.matched, color: "text-green-600" },
                    { label: "New (need barcode)", value: validation.preview.new_items, color: validation.preview.new_items > 0 ? "text-amber-600" : "text-gray-700" },
                    { label: "Data changed", value: validation.preview.changed_items ?? 0, color: (validation.preview.changed_items ?? 0) > 0 ? "text-blue-600" : "text-gray-700" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-gray-50 rounded-lg p-3 text-center">
                      <div className={`text-2xl font-bold ${color || "text-gray-900"}`}>{value ?? "—"}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-gray-400 mt-3">
                File: <span className="font-mono">{file?.name}</span>
                &nbsp;·&nbsp;Stock date: <span className="font-semibold text-gray-600">{uploadDate}</span>
                &nbsp;·&nbsp;Upload time: <span className="font-semibold text-gray-600">{uploadTime}</span>
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setValidation(null); setStep(STEPS.FILE_PREVIEW); }}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                ← Back
              </button>
              {validation.valid && !(validation.duplicate && !validation.needs_approval && !isAdmin) && (
                <button
                  onClick={() => handleConfirm(validation.duplicate && !validation.needs_approval)}
                  className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg text-sm transition-colors"
                >
                  {validation.needs_approval
                    ? "Submit for Approval"
                    : validation.duplicate
                    ? "Override & Import"
                    : "Confirm Import"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step: UPLOADING */}
        {step === STEPS.UPLOADING && (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-gray-500">Importing {file?.name}…</p>
          </div>
        )}

        {/* Step: DONE */}
        {step === STEPS.DONE && result && (
          <div className="bg-white border rounded-xl p-6 shadow-sm text-center space-y-4">
            {result.needs_approval ? (
              <>
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100">
                  <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900">Submitted for Approval</h2>
                <p className="text-sm text-gray-500">
                  Upload for <strong>{result.snapshot_date}</strong> is pending admin approval.
                  Data will be imported after approval.
                </p>
              </>
            ) : (
              <>
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100">
                  <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-gray-900">Upload Complete</h2>
                <div className="grid grid-cols-4 gap-3 text-sm">
                  {[
                    { label: "Total items", value: result.total_rows, color: "text-gray-900" },
                    { label: "Matched", value: result.matched, color: "text-green-600" },
                    { label: "New (pending barcode)", value: result.new_items, color: result.new_items > 0 ? "text-amber-600" : "text-gray-400" },
                    { label: "Data changed", value: result.changed_items ?? 0, color: (result.changed_items ?? 0) > 0 ? "text-blue-600" : "text-gray-400" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-gray-50 rounded-lg p-3">
                      <div className={`text-2xl font-bold ${color}`}>{value}</div>
                      <div className="text-xs text-gray-500">{label}</div>
                    </div>
                  ))}
                </div>
                {(result.new_items > 0 || result.changed_items > 0) && (
                  <Alert type="warning">
                    {result.new_items > 0 && `${result.new_items} new item(s) need barcodes. `}
                    {result.changed_items > 0 && `${result.changed_items} item(s) have data changes to review. `}
                    Manager has been notified.
                  </Alert>
                )}
              </>
            )}
            <div className="flex gap-3">
              <button onClick={reset} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                Upload Another
              </button>
              <Link
                to="/upload/history"
                className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg text-sm text-center transition-colors"
              >
                View History
              </Link>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
