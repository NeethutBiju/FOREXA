import React, { useEffect, useState } from "react";
import {
  Shield,
  Users,
  LogOut,
  AlertTriangle,
  CloudRain,
  Thermometer,
  Wind,
  Activity,
  CheckCircle2,
  Database,
} from "lucide-react";
import { UserSession, logoutUser } from "../firebase";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

export const RoleDashboard: React.FC<{
  session: UserSession;
  onLogout: () => void;
}> = ({ session, onLogout }) => {
  const [forecast, setForecast] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any>(null);
  const [leadH, setLeadH] = useState<number>(24);

  useEffect(() => {
    const headers: Record<string, string> = {
      "X-Forexa-Role": session.role,
    };
    if (session.idToken) {
      headers["Authorization"] = `Bearer ${session.idToken}`;
    }
    fetch(`${API_BASE}/forecast/latest?lead_h=${leadH}`, { headers })
      .then((r) => r.json())
      .then(setForecast)
      .catch(console.error);

    if (session.role === "technical") {
      fetch(`${API_BASE}/auth/audit-logs`, { headers })
        .then((r) => r.json())
        .then(setAuditLogs)
        .catch(console.error);
    }
  }, [session, leadH]);

  const handleSignOut = async () => {
    await logoutUser();
    onLogout();
  };

  return (
    <div className="min-h-screen bg-[#FAFAFE] text-slate-800 flex flex-col">
      {/* Navbar */}
      <header className="w-full bg-white border-b border-slate-100 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-[#6D28D9] flex items-center justify-center shadow-sm">
            <div className="w-4 h-4 rounded-full border-2 border-white flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
            </div>
          </div>
          <span className="font-extrabold text-sm tracking-wide text-slate-900">
            FOREXA
          </span>
          <span className="text-slate-200">|</span>
          <span className="text-xs font-semibold text-[#6D28D9] bg-[#F3E8FF] px-2.5 py-0.5 rounded-full">
            {session.role === "authority"
              ? "Disaster-Management Authorities Portal"
              : "Technical Meteorologist & MLOps Portal"}
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold text-slate-800">
              {session.email}
            </div>
            <div className="text-[10px] text-slate-400">
              {session.stateRegion} • Firebase UID: {session.uid.slice(0, 8)}...
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-6">
        {/* Session Verification Banner */}
        <div className="bg-white border border-purple-100 rounded-2xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-[#F3E8FF] text-[#6D28D9] flex items-center justify-center">
              {session.role === "authority" ? (
                <Shield className="w-5 h-5" />
              ) : (
                <Users className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-extrabold text-slate-900">
                  Authenticated as{" "}
                  {session.role === "authority"
                    ? "Authorities (Disaster Management)"
                    : "Technical Person (Meteorologist / MLOps)"}
                </h2>
                <span className="inline-flex items-center space-x-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Stored in Firebase &amp; Cloud Firestore</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Firebase Project: <code className="font-mono">forexa-e5dc7</code>{" "}
                • Jurisdiction: {session.stateRegion} • Forecast Lead:{" "}
                <strong>+{leadH} Hours</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 bg-[#F6F5FF] p-1 rounded-xl border border-purple-100">
            {[6, 12, 24, 48, 72].map((h) => (
              <button
                key={h}
                onClick={() => setLeadH(h)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  leadH === h
                    ? "bg-[#6D28D9] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                +{h}h
              </button>
            ))}
          </div>
        </div>

        {/* District Cards Grid */}
        {forecast && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {forecast.districts
              .filter((d: any) => d.has_native_station)
              .map((d: any) => (
                <div
                  key={d.district}
                  className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-extrabold text-sm text-slate-900">
                        {d.district}
                      </h3>
                      <span className="text-[10px] text-slate-400">
                        {d.climate_zone} • {d.elevation_m}m
                      </span>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        d.risk_category === "SEVERE"
                          ? "bg-red-100 text-red-700"
                          : d.risk_category === "WARNING"
                          ? "bg-amber-100 text-amber-800"
                          : d.risk_category === "WATCH"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {d.risk_category}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-[#FAFAFE] p-2.5 rounded-xl border border-slate-100 text-center">
                    <div>
                      <div className="text-[10px] text-slate-400 flex items-center justify-center space-x-1">
                        <CloudRain className="w-3 h-3 text-[#6D28D9]" />
                        <span>Rain 6h</span>
                      </div>
                      <div className="text-xs font-extrabold text-slate-800 mt-0.5">
                        {d.blended_variables?.rainfall_6h_mm} mm
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 flex items-center justify-center space-x-1">
                        <Thermometer className="w-3 h-3 text-rose-500" />
                        <span>Temp</span>
                      </div>
                      <div className="text-xs font-extrabold text-slate-800 mt-0.5">
                        {d.blended_variables?.temperature_c} °C
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 flex items-center justify-center space-x-1">
                        <Wind className="w-3 h-3 text-sky-500" />
                        <span>Wind</span>
                      </div>
                      <div className="text-xs font-extrabold text-slate-800 mt-0.5">
                        {d.blended_variables?.wind_speed_ms} m/s
                      </div>
                    </div>
                  </div>

                  {/* Technical-Only District Weights & Crisp Explainability Brief */}
                  {session.role === "technical" && d.district_unified_weights && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-[#6D28D9]">
                        <span>Shared District Weights:</span>
                        <span>{d.district_unified_weights.priority_mode}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-[10px] font-mono bg-[#F6F5FF] p-1.5 rounded-lg text-center">
                        <span>
                          NWP:{" "}
                          {(d.district_unified_weights.W_NWP * 100).toFixed(1)}%
                        </span>
                        <span>
                          Ens:{" "}
                          {(
                            d.district_unified_weights.W_Ensemble * 100
                          ).toFixed(1)}
                          %
                        </span>
                        <span>
                          AI:{" "}
                          {(d.district_unified_weights.W_AI * 100).toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed bg-slate-50 p-2 rounded-lg">
                        {d.technical_explainability_brief}
                      </p>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}

        {/* Technical-Only Stored Login Audit Trail */}
        {session.role === "technical" && auditLogs && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="flex items-center space-x-2 mb-3">
              <Database className="w-4 h-4 text-[#6D28D9]" />
              <h3 className="text-sm font-extrabold text-slate-900">
                Stored Login &amp; Registration Audit Log (Cloud Firestore +
                DuckDB Mirror)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] uppercase text-slate-400">
                    <th className="py-2">Event ID</th>
                    <th className="py-2">Email</th>
                    <th className="py-2">Designated Role</th>
                    <th className="py-2">Action</th>
                    <th className="py-2">State / Region</th>
                    <th className="py-2">Provider</th>
                    <th className="py-2">Timestamp (UTC)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {auditLogs.login_audit_logs?.slice(0, 8).map((log: any) => (
                    <tr key={log.event_id}>
                      <td className="py-2 font-mono text-[11px] text-[#6D28D9]">
                        {log.event_id}
                      </td>
                      <td className="py-2 font-semibold">{log.email}</td>
                      <td className="py-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F3E8FF] text-[#6D28D9]">
                          {log.selected_role}
                        </span>
                      </td>
                      <td className="py-2">{log.action}</td>
                      <td className="py-2">{log.state_region}</td>
                      <td className="py-2">{log.auth_provider}</td>
                      <td className="py-2 text-slate-400">
                        {String(log.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
