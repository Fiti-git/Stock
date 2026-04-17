import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function LicenseSetupRequired() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isServiceProvider = user?.role === "ServiceProvider";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
        <div className="text-6xl mb-4">&#9881;</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">License Setup Required</h1>
        <p className="text-gray-500 mb-6">
          This system has not been configured with a license yet.
          A ServiceProvider administrator needs to complete the initial setup.
        </p>

        {user && isServiceProvider ? (
          <button
            onClick={() => navigate("/admin/license-configuration")}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
          >
            Go to License Setup
          </button>
        ) : user ? (
          <p className="text-sm text-gray-400">
            You do not have permission to configure the license. Contact your service provider.
          </p>
        ) : (
          <button
            onClick={() => navigate("/login")}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Go to Login
          </button>
        )}
      </div>
    </div>
  );
}
