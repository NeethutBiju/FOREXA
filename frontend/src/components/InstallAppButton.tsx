import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";

declare global {
  interface Window {
    __forexaInstallPrompt?: any;
  }
}

export const InstallAppButton: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(() =>
    typeof window !== "undefined" ? window.__forexaInstallPrompt || null : null
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(display-mode: standalone)").matches
      : false
  );
  const [showTip, setShowTip] = useState<boolean>(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__forexaInstallPrompt = e;
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      window.__forexaInstallPrompt = null;
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (isInstalled) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try {
        const choice = await deferredPrompt.userChoice;
        if (choice?.outcome === "accepted") {
          setIsInstalled(true);
        }
      } catch {
        // ignore
      }
      setDeferredPrompt(null);
      window.__forexaInstallPrompt = null;
    } else {
      setShowTip((prev) => !prev);
      setTimeout(() => setShowTip(false), 6000);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleInstallClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#14532D] hover:bg-[#052E16] text-white text-xs font-bold shadow-sm transition"
        title="Install FOREXA for full offline caching & SIM SMS alerts"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>

      {showTip && (
        <div className="absolute right-0 mt-2 w-64 p-3 rounded-xl bg-white border border-emerald-200 shadow-xl text-[11px] text-slate-700 z-50 leading-relaxed">
          <strong className="text-[#14532D] block mb-1">
            Install FOREXA App:
          </strong>
          In Chrome (Android), tap <strong>⋮ Menu → Install App</strong>. In
          Safari (iPhone), tap <strong>Share → Add to Home Screen</strong>.
        </div>
      )}
    </div>
  );
};
