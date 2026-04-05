import { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import Alert from "../../components/Alert";
import { useAuth } from "../../contexts/AuthContext";
import { validateUpload, confirmUpload } from "../../api/uploads";

const STEPS = { IDLE: "idle", VALIDATING: "validating", PREVIEW: "preview", UPLOADING: "uploading", DONE: "done" };

export default function UploadPage() {
  const { user } = useAuth();
  const [step, setStep] = useState(STEPS.IDLE);
  const [file, setFile] = useState(null);
  const [validation, setValidation] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const now = new Date();
  const today = now.toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const todayISO = now.toLocaleDateString("en-CA"); // YYYY-MM-DD fallback
  const uploadTime = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  const processFile = useCallback(async (f) => {
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["xls", "xlsx"].includes(ext)) {
      setError("Only .xls and .xlsx files are accepted.");
      return;
    }
    setFile(f);
    setError("");
    setStep(STEPS.VALIDATING);
    try {
      const { data } = await validateUpload(f);
      setValidation(data);
      setStep(STEPS.PREVIEW);
    } catch (err) {
      setError(err.response?.data?.detail || "Validation failed.");
      setStep(STEPS.IDLE);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    processFile(e.dataTransfer.files[0]);
  }, [processFile]);

  const handleConfirm = async (overwrite = false) => {
    setStep(STEPS.UPLOADING);
    setError("");
    try {
      const { data } = await confirmUpload(file, overwrite);
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
    setStep(STEPS.IDLE);
    setFile(null);
    setValidation(null);
    setResult(null);
    setError("");
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
            <span className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono">
              {today}
            </span>
            &nbsp;·&nbsp;
            <Link to="/upload/history" className="text-brand-600 hover:underline text-xs">
              View history
            </Link>
          </p>
        </div>

        {/* Step: IDLE or VALIDATING — drop zone */}
        {(step === STEPS.IDLE || step === STEPS.VALIDATING) && (
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
              onChange={(e) => processFile(e.target.files[0])}
            />
            {step === STEPS.VALIDATING ? (
              <div className="text-brand-600 text-sm font-medium animate-pulse">
                Validating file…
              </div>
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
              </>
            )}
          </div>
        )}

        {error && <div className="mt-4"><Alert type="error">{error}</Alert></div>}

        {/* Step: PREVIEW */}
        {step === STEPS.PREVIEW && validation && (
          <div className="space-y-4">
            <div className="bg-white border rounded-xl p-5 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-4">File Preview</h2>

              {/* Validation errors */}
              {!validation.valid && (
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

              {/* Past date — needs admin approval */}
              {validation.needs_approval && (
                <Alert type="warning">
                  This file is dated <strong>{validation.preview?.snapshot_date}</strong> (not today).
                  It will be submitted for admin approval before taking effect.
                </Alert>
              )}

              {/* Duplicate warning */}
              {validation.duplicate && !validation.needs_approval && (
                <Alert type="warning">
                  A successful upload already exists for this date. Confirming will overwrite it.
                </Alert>
              )}

              {/* Preview stats */}
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
                &nbsp;·&nbsp;XLS date:{" "}
                <span className="font-semibold text-gray-600">
                  {validation.preview?.snapshot_date ?? todayISO}
                  {!validation.preview?.snapshot_date && (
                    <span className="ml-1 text-amber-500">(today — not found in file)</span>
                  )}
                </span>
                &nbsp;·&nbsp;Upload time:{" "}
                <span className="font-semibold text-gray-600">{uploadTime}</span>
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={reset}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              {validation.valid && (
                <button
                  onClick={() => handleConfirm(validation.duplicate && !validation.needs_approval)}
                  className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg text-sm transition-colors"
                >
                  {validation.needs_approval
                    ? "Submit for Approval"
                    : validation.duplicate
                    ? "Overwrite & Import"
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
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-gray-900">{result.total_rows}</div>
                    <div className="text-xs text-gray-500">Total items</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-2xl font-bold text-green-600">{result.matched}</div>
                    <div className="text-xs text-gray-500">Matched</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className={`text-2xl font-bold ${result.new_items > 0 ? "text-amber-600" : "text-gray-400"}`}>
                      {result.new_items}
                    </div>
                    <div className="text-xs text-gray-500">New (pending barcode)</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className={`text-2xl font-bold ${result.changed_items > 0 ? "text-blue-600" : "text-gray-400"}`}>
                      {result.changed_items ?? 0}
                    </div>
                    <div className="text-xs text-gray-500">Data changed</div>
                  </div>
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
              <Link to="/upload/history"
                className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-lg text-sm text-center transition-colors">
                View History
              </Link>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
