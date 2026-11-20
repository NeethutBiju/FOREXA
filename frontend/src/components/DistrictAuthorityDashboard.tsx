import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Radio,
  LogOut,
  Bell,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  Download,
  FileText,
  MapPin,
} from "lucide-react";
import {
  UserSession,
  getStoredAssignedDistrict,
  getStoredPrototypeMobile,
  getUserInitials,
  logoutUser,
  sendSystemAlertNotification,
  triggerNativeOfflineSms,
} from "../firebase";
import { InstallAppButton } from "./InstallAppButton";
import {
  acknowledgeDistrictAlertApi,
  fetchDistrictDispatchStateApi,
  sendDistrictHeartbeatApi,
} from "../utils/forecastEngine";

interface DistrictAuthorityDashboardProps {
  session: UserSession | null;
  onLogout?: () => void;
}

const DISTRICT_SHELTER_INFO: Record<
  string,
  {
    shelter: string;
    capacity: number;
    distanceKm: string;
    roadAvoid: string;
    roadReason: string;
  }
> = {
  Wayanad: {
    shelter: "Government Model Higher Secondary School, Kalpetta",
    capacity: 650,
    distanceKm: "4.2 km",
    roadAvoid: "NH 766 Thamarassery Ghat Section",
    roadReason: "High landslide & rockfall risk",
  },
  Idukki: {
    shelter: "District Collectorate Relief Camp, Painavu",
    capacity: 520,
    distanceKm: "5.1 km",
    roadAvoid: "NH 85 Adimali–Munnar Ghat Corridor",
    roadReason: "Slope instability & heavy runoff risk",
  },
  Kozhikode: {
    shelter: "Government Medical College Shelter Annex, Kozhikode",
    capacity: 800,
    distanceKm: "3.8 km",
    roadAvoid: "NH 66 Coastal Low-Lying Stretch",
    roadReason: "Severe waterlogging & tidal surge risk",
  },
  Ernakulam: {
    shelter: "CUSAT Emergency Relief Complex, Kalamassery",
    capacity: 900,
    distanceKm: "4.6 km",
    roadAvoid: "Aluva–Periyar Bridge Approach Road",
    roadReason: "River overflow & urban flood risk",
  },
};

export const DistrictAuthorityDashboard: React.FC<
  DistrictAuthorityDashboardProps
> = ({ session, onLogout }) => {
  const navigate = useNavigate();

  const assignedDistrict =
    session?.assignedDistrict || getStoredAssignedDistrict() || "Wayanad";
  const registeredMobile =
    session?.receiverMobile || getStoredPrototypeMobile() || "";

  const [dispatchState, setDispatchState] = useState<any>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [browserOnline, setBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [viewingReport, setViewingReport] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const loadDispatchState = async () => {
    const data = await fetchDistrictDispatchStateApi({
      district: assignedDistrict,
      leadH: 24,
      role: "district_authority",
      token: session?.idToken,
    });
    setDispatchState(data);
  };

  useEffect(() => {
    loadDispatchState();
    const poll = setInterval(loadDispatchState, 8000);
    return () => clearInterval(poll);
  }, [assignedDistrict, session?.idToken]);

  // Silent real network detection + 10-second heartbeat so State Authority & server know if this district is online/offline
  useEffect(() => {
    const handleOnline = () => {
      setBrowserOnline(true);
      loadDispatchState();
    };
    const handleOffline = () => {
      setBrowserOnline(false);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const ping = () => {
      if (!navigator.onLine) {
        setBrowserOnline(false);
        return;
      }
      sendDistrictHeartbeatApi({
        district: assignedDistrict,
        email: session?.email || "",
        receiver_mobile: registeredMobile,
        token: session?.idToken,
      })
        .then(() => setBrowserOnline(true))
        .catch(() => setBrowserOnline(false));
    };

    ping();
    const timer = setInterval(ping, 10000);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(timer);
    };
  }, [assignedDistrict, session?.email, session?.idToken, registeredMobile]);

  const hasDispatch = Boolean(
    dispatchState?.has_official_dispatch && dispatchState?.district_alert
  );
  const alert = hasDispatch ? dispatchState.district_alert : null;
  const report = hasDispatch ? dispatchState.district_final_report : null;
  const isAcked = alert?.ack_status === "ACKNOWLEDGED";
  const activeMobile =
    dispatchState?.prototype_receiver_mobile ||
    registeredMobile ||
    "Not registered";

  const shelterMeta = DISTRICT_SHELTER_INFO[assignedDistrict] || {
    shelter: `Government Model School Relief Camp, ${assignedDistrict}`,
    capacity: 500,
    distanceKm: "5.4 km",
    roadAvoid: `${assignedDistrict} Low-Lying Access Corridor`,
    roadReason: "High waterlogging & runoff risk",
  };

  const buildOfficialReportText = () => {
    const bf = alert?.blended_forecast || {};
    const lines = [
      "======================================================================",
      "FOREXA — OFFICIAL DISTRICT WEATHER FORECAST & EMERGENCY REPORT",
      "======================================================================",
      `Report ID       : ${report?.report_id || `RPT-${assignedDistrict.slice(0, 3).toUpperCase()}`}`,
      `District        : ${assignedDistrict}, Kerala`,
      `Issued By       : ${report?.issued_by || "State Disaster Management Authority (KSDMA)"}`,
      `Issued At       : ${report?.issued_at || new Date().toISOString()}`,
      `Alert Severity  : ${alert?.severity || "HIGH"} ALERT`,
      `Weather Event   : ${alert?.event_type || "Heavy Rainfall Advisory"}`,
      `Expected Onset  : Within ${alert?.lead_time_hours ?? 24} hours`,
      "",
      "--- FINAL BLENDED FORECAST PARAMETERS --------------------------------",
      `6h Rainfall     : ${bf.precip_6h_mm ?? "—"} mm`,
      `Wind Speed      : ${bf.wind_ms ?? "—"} m/s`,
      `Temperature     : ${bf.temp_c ?? "—"} °C`,
      `Humidity        : ${bf.humidity_pct ?? "—"} %`,
      `Pressure        : ${bf.pressure_hpa ?? "—"} hPa`,
      "",
      "--- EXECUTIVE SUMMARY ------------------------------------------------",
      report?.executive_summary ||
        `Official forecast alert for ${assignedDistrict}. Activate district preparedness protocol immediately.`,
      "",
      "--- MANDATORY DISTRICT DIRECTIVES ------------------------------------",
      ...(
        alert?.recommended_actions ||
        report?.mandatory_directives || [
          "Activate district emergency operations center and rapid-response teams.",
        ]
      ).map((d: string, i: number) => `${i + 1}. ${d}`),
      "",
      "--- EVACUATION & ROUTE ADVISORY --------------------------------------",
      `Primary Shelter : ${shelterMeta.shelter} (Capacity: ${shelterMeta.capacity})`,
      `Route to Avoid  : ${shelterMeta.roadAvoid} (${shelterMeta.roadReason})`,
      `Contact Mobile  : ${activeMobile}`,
      "======================================================================",
    ];
    return lines.join("\n");
  };

  const handleDownloadReport = () => {
    const content = buildOfficialReportText();
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FOREXA_Official_Report_${assignedDistrict}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Official report downloaded for ${assignedDistrict}.`);
  };

  const handleAcknowledge = async () => {
    const res = await acknowledgeDistrictAlertApi({
      district: assignedDistrict,
      acknowledged_by:
        session?.email || `${assignedDistrict} District Authority`,
      note: "Official State Authority alert and report acknowledged.",
      role: "district_authority",
      token: session?.idToken,
    });
    if (res?.acknowledged) {
      showToast(`Alert receipt confirmed for ${assignedDistrict}.`);
      loadDispatchState();
    }
  };

  const initials = getUserInitials(session?.email);

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F4F9F6] text-slate-800">
      {/* CLEAN EXECUTIVE HEADER */}
      <header className="sticky top-0 z-40 w-full bg-white border-b border-slate-200/80">
        <div className="max-w-[1440px] mx-auto px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#14532D] flex items-center justify-center text-white shadow-sm">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-slate-500">
                FOREXA · Weather Early Warning &amp; Emergency Decision Support
              </div>
              <h1 className="text-base font-bold text-[#14532D] tracking-tight">
                District Authority Dashboard — {assignedDistrict}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <InstallAppButton />
            <button
              type="button"
              onClick={async () => {
                const ok = await sendSystemAlertNotification(
                  `FOREXA District Alert · ${assignedDistrict}`,
                  hasDispatch
                    ? `${alert.event_type} (${alert.blended_forecast?.precip_6h_mm ?? "—"} mm/6h). Official report ready.`
                    : `Connected to FOREXA alerts for ${assignedDistrict}.`
                );
                showToast(
                  ok
                    ? "Live OS alert notifications enabled."
                    : "Allow notifications in your browser settings to receive live alert banners."
                );
              }}
              className="relative p-2 rounded-xl border border-slate-200 bg-white hover:bg-[#ECFDF5] text-slate-600 transition"
              title="Enable Live OS Alert Notifications"
            >
              <Bell className="w-4 h-4" />
              {hasDispatch && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                  1
                </span>
              )}
            </button>

            <div className="inline-flex items-center gap-2.5 pl-1.5 pr-3.5 py-1 rounded-full bg-[#ECFDF5] border border-emerald-200">
              <span className="w-7 h-7 rounded-full bg-[#14532D] text-white text-xs font-bold flex items-center justify-center">
                {initials}
              </span>
              <div className="leading-tight">
                <div className="text-xs font-bold text-[#14532D]">
                  District Authority
                </div>
                <div className="text-[10px] font-medium text-emerald-800/80">
                  {assignedDistrict}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={async () => {
                await logoutUser();
                onLogout?.();
                navigate("/login");
              }}
              title="Sign out"
              className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Minimal Status Bar: ONLY "Kerala · Online" or "Kerala · Offline" + Offline SIM SMS Trigger */}
        <div className="w-full px-6 py-2 bg-white border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
            <span
              className={`w-2 h-2 rounded-full ${
                browserOnline ? "bg-[#15803D]" : "bg-red-600"
              }`}
            />
            <span>{browserOnline ? "Kerala · Online" : "Kerala · Offline"}</span>
          </span>

          {!browserOnline && (
            <button
              type="button"
              onClick={() => {
                const bf = alert?.blended_forecast || {};
                const smsText = `[FOREXA ${alert?.severity || "HIGH"} ALERT] ${assignedDistrict.toUpperCase()}: ${alert?.event_type || "Weather Alert"} (${bf.precip_6h_mm ?? "—"}mm/6h, Wind ${bf.wind_ms ?? "—"}m/s). Offline cached alert — emergency protocol active.`;
                const res = triggerNativeOfflineSms(activeMobile, smsText);
                showToast(
                  res.launched
                    ? `Opening Offline SIM SMS to ${res.target}`
                    : res.error || "No valid registered mobile number found."
                );
              }}
              className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold transition"
            >
              Send Offline SIM SMS →
            </button>
          )}
        </div>
      </header>

      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-white text-slate-800 border border-emerald-200 px-5 py-3.5 rounded-2xl shadow-lg flex items-center gap-3 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* MAIN CLEAN EXECUTIVE WORKSPACE (ONLY 1 OFFICIAL ALERT DISPATCHED FROM STATE AUTHORITY) */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-7 space-y-6">
        {!hasDispatch ? (
          <section className="rounded-2xl bg-white border border-slate-200/90 p-10 text-center shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#ECFDF5] text-[#14532D] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-[#14532D]">
              No Active Alert Dispatched for {assignedDistrict}
            </h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              Your District Authority terminal is connected and standing by. As
              soon as State Authorities click{" "}
              <strong className="text-slate-800">
                “Send Final Report to {assignedDistrict} Authority”
              </strong>
              , the official alert and downloadable report will appear here
              immediately.
            </p>
          </section>
        ) : (
          <>
            {/* 1. SINGLE OFFICIAL ALERT BANNER */}
            <section className="rounded-2xl bg-red-50/40 border border-red-300 p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-red-600 text-white text-[11px] font-bold uppercase tracking-wider">
                  {alert.severity === "RED"
                    ? "SEVERE RISK WEATHER ALERT"
                    : alert.severity === "ORANGE"
                    ? "HIGH RISK WEATHER ALERT"
                    : "ACTIVE WEATHER ALERT"}
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-white border border-red-300 text-red-700 text-[11px] font-bold uppercase tracking-wider">
                  ACTIVE
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 pt-1">
                <div>
                  <div className="text-[11px] font-medium text-slate-500">
                    District
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {assignedDistrict}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500">
                    Weather Event
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5 truncate">
                    {alert.event_type}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500">
                    Predicted Rainfall
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {alert.blended_forecast?.precip_6h_mm ?? "—"} mm
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500">
                    Alert Risk
                  </div>
                  <div className="text-sm font-bold text-red-700 mt-0.5">
                    {alert.severity === "RED"
                      ? "Severe"
                      : alert.severity === "ORANGE"
                      ? "High"
                      : "Moderate"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500">
                    Wind Speed
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {alert.blended_forecast?.wind_ms ?? "—"} m/s
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500">
                    Expected Onset
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    Within {alert.lead_time_hours ?? 24} hrs
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-500">
                    Alert Sent
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">
                    {alert.updated_at
                      ? new Date(alert.updated_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Active"}
                  </div>
                </div>
              </div>
            </section>

            {/* 2. FOUR SUMMARY KPI CARDS */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-sm">
                <div className="text-xs font-medium text-slate-500">
                  Active Alerts
                </div>
                <div className="text-2xl font-extrabold text-red-600 mt-2">
                  1
                </div>
              </div>
              <div className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-sm">
                <div className="text-xs font-medium text-slate-500">
                  Official Reports
                </div>
                <div className="text-2xl font-extrabold text-slate-900 mt-2">
                  1
                </div>
              </div>
              <div className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-sm">
                <div className="text-xs font-medium text-slate-500">
                  Received
                </div>
                <div className="text-2xl font-extrabold text-[#15803D] mt-2">
                  {isAcked ? 1 : 0}
                </div>
              </div>
              <div className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-sm">
                <div className="text-xs font-medium text-slate-500">
                  Awaiting
                </div>
                <div className="text-2xl font-extrabold text-orange-600 mt-2">
                  {isAcked ? 0 : 1}
                </div>
              </div>
            </section>

            {/* 3. SINGLE OFFICIAL ALERT & REPORT TABLE + SHELTER & ROADS SIDEBAR */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8 rounded-2xl bg-white border border-slate-200/90 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-bold text-[#14532D]">
                    Official State Authority Alert &amp; Report
                  </h2>
                  <span className="text-xs font-medium text-slate-500">
                    1 active dispatch · {assignedDistrict}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-500 bg-slate-50/60">
                        <th className="py-3 px-4">#</th>
                        <th className="py-3 px-4">Authority Unit / Alert</th>
                        <th className="py-3 px-3">Contact</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3">Report</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="hover:bg-[#F4F9F6]/60 transition">
                        <td className="py-5 px-4 font-semibold text-slate-500">
                          1
                        </td>
                        <td className="py-5 px-4 max-w-[280px]">
                          <div className="font-bold text-slate-900 leading-snug">
                            District Emergency Operations — {assignedDistrict}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {alert.event_type} ·{" "}
                            {alert.blended_forecast?.precip_6h_mm ?? "—"} mm/6h
                            · Dispatched by State Authority
                          </div>
                        </td>
                        <td className="py-5 px-3 font-medium text-slate-700 whitespace-nowrap">
                          {activeMobile}
                        </td>
                        <td className="py-5 px-3 whitespace-nowrap">
                          {isAcked ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-[#15803D] border border-emerald-200 text-[11px] font-bold">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>RECEIVED</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={handleAcknowledge}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-[11px] font-bold transition"
                            >
                              <Clock className="w-3 h-3" />
                              <span>AWAITING · ACK</span>
                            </button>
                          )}
                        </td>
                        <td className="py-5 px-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setViewingReport(true)}
                            className="px-3 py-1.5 rounded-lg border border-[#15803D] text-[#14532D] hover:bg-[#ECFDF5] font-semibold text-xs transition"
                          >
                            View Report
                          </button>
                        </td>
                        <td className="py-5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={handleDownloadReport}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-[#14532D] text-slate-800 hover:text-white font-semibold text-xs transition"
                          >
                            Download
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* RIGHT 4 COLS: EVACUATION SHELTER & ROADS TO AVOID */}
              <div className="lg:col-span-4 rounded-2xl bg-white border border-slate-200/90 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#14532D]">
                    Evacuation Shelter
                  </h3>
                  <span className="text-[11px] font-medium text-slate-400">
                    Live from FOREXA
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-1.5">
                  <div className="text-sm font-bold text-slate-900">
                    {shelterMeta.shelter}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span>
                      Capacity{" "}
                      <strong className="text-slate-900">
                        {shelterMeta.capacity}
                      </strong>
                    </span>
                    <span>
                      Availability{" "}
                      <strong className="text-[#15803D]">Available</strong>
                    </span>
                    <span>
                      Distance{" "}
                      <strong className="text-slate-900">
                        {shelterMeta.distanceKm}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <h3 className="text-sm font-bold text-slate-900 mb-2.5">
                    Roads to Avoid
                  </h3>
                  <div className="p-4 rounded-xl bg-red-50/60 border border-red-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-red-700">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{shelterMeta.roadAvoid}</span>
                    </div>
                    <div className="text-xs text-red-600/90 pl-5">
                      {shelterMeta.roadReason}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* WORKING "VIEW REPORT" MODAL */}
      {viewingReport && alert && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-[#14532D] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5" />
                <div>
                  <div className="text-[11px] font-semibold text-emerald-200">
                    OFFICIAL DISTRICT FORECAST REPORT
                  </div>
                  <h3 className="text-sm font-bold">
                    {assignedDistrict} District Emergency Operations
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingReport(false)}
                className="p-1.5 rounded-lg hover:bg-white/15 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-[#F4F9F6] border border-emerald-100">
                  <div className="text-[10px] font-semibold text-slate-500">
                    District
                  </div>
                  <div className="font-bold text-slate-900 mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#15803D]" />
                    {assignedDistrict}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                  <div className="text-[10px] font-semibold text-red-600">
                    Alert Level
                  </div>
                  <div className="font-bold text-red-700 mt-0.5">
                    {alert.severity} ALERT
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F4F9F6] border border-emerald-100">
                  <div className="text-[10px] font-semibold text-slate-500">
                    6h Rainfall
                  </div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {alert.blended_forecast?.precip_6h_mm ?? "—"} mm
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F4F9F6] border border-emerald-100">
                  <div className="text-[10px] font-semibold text-slate-500">
                    Wind Speed
                  </div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {alert.blended_forecast?.wind_ms ?? "—"} m/s
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                <div className="font-bold text-[#14532D]">Executive Summary</div>
                <p className="text-slate-700 leading-relaxed">
                  {report?.executive_summary ||
                    `Official blended forecast report for ${assignedDistrict}. Immediate readiness advised.`}
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-[#14532D]">
                  Mandatory Action Directives
                </div>
                <ul className="space-y-1.5 text-slate-700">
                  {(
                    alert.recommended_actions ||
                    report?.mandatory_directives ||
                    []
                  ).map((act: string, i: number) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] shrink-0 mt-0.5" />
                      <span>{act}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setViewingReport(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 transition"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleDownloadReport}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#14532D] hover:bg-[#166534] text-white text-xs font-bold transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Official Report</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="w-full bg-white border-t border-slate-200/80 px-6 py-4 text-center text-xs text-slate-500">
        FOREXA · Kerala Weather Early Warning &amp; District Emergency Command
      </footer>
    </div>
  );
};
