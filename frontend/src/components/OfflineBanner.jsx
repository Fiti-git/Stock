import { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine !== false
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[1300] bg-red-600 text-white text-sm font-medium px-4 py-2 text-center shadow"
      role="status"
      aria-live="polite"
    >
      Offline — bills will sync when connection returns
    </div>
  );
}
