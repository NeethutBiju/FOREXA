import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Radio,
  Shield,
  Sliders,
  BarChart3,
  Clock,
  WifiOff,
  CheckCircle2,
  History,
  ArrowDownRight,
  LogOut,
  Sparkles,
  Users,
  Activity,
} from "lucide-react";
import {
  addOperationalGuidanceApi,
  ApiStatusState,
  ComputedDistrictForecast,
  fetchDistrictTimelineApi,
  fetchEvaluationApi,
  fetchHistoricalAnalogsApi,
  fetchLatestForecastApi,
  fetchModelVersionsApi,
  fetchShapApi,
  fetchUnifiedWeightsApi,
  HORIZONS,
  HorizonHours,
  HumanGuidanceEntry,
  INITIAL_2025_TRAINED_SNAPSHOT,
  mapRawHistoricalMatches,
  MatchedHistoricalAnalog,
  revertOperationalGuidanceApi,
  SeasonType,
  transformBackendDistrictToForecast,
  updateSourceAvailabilityApi,
} from "../utils/forecastEngine";
import {
  CycloneSpiralIcon,
  EventIcon,
  MiniSparkline,
  SeverityChip,
} from "./WeatherIcons";
import { KeralaImpactMap } from "./KeralaImpactMap";
import {
  AnalogOverlayChart,
  RainfallOverTimeChart,
} from "./ForecastCharts";
import { DistrictDetailDrawer } from "./DistrictDetailDrawer";
import { ModelInsightsTab } from "./ModelInsightsTab";
import { VisualizationTab } from "./VisualizationTab";
import { ControlRoomTab } from "./ControlRoomTab";
import { logoutUser, UserSession } from "../firebase";

export type DashboardTab =
  | "forecast"
  | "insights"
  | "visualization"
  | "control";

interface ForecastIntelligenceDashboardProps {
  session: UserSession | null;
  forcedRole?: "authority" | "technical";
  onLogout?: () => void;
}

export const ForecastIntelligenceDashboard: React.FC<
  ForecastIntelligenceDashboardProps
> = ({ session, forcedRole, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const analogsSectionRef = useRef<HTMLDivElement | null>(null);

  const initialRole: "authority" | "technical" =
    forcedRole ||
    session?.role ||
    (location.pathname.includes("authorities") ? "authority" : "technical");

  const [activeRole, setActiveRole] = useState<"authority" | "technical">(
    initialRole
  );

  useEffect(() => {
    if (forcedRole) {
      setActiveRole(forcedRole);
    } else if (session?.role) {
      setActiveRole(session.role);
    }
  }, [forcedRole, session]);

  const isTechnicalRole = activeRole === "technical";

  const [activeTab, setActiveTab] = useState<DashboardTab>(() => {
    const hash = window.location.hash.replace("#", "");
    if (
      hash === "insights" ||
      hash === "visualization" ||
      hash === "control" ||
      hash === "forecast"
    ) {
      return hash;
    }
    return "forecast";
  });

  const changeTab = (tab: DashboardTab) => {
    if (
      !isTechnicalRole &&
      (tab === "insights" || tab === "visualization" || tab === "control")
    ) {
      showToast(
        "Authorities view displays only the Final Blended Forecast & Priority Districts."
      );
      return;
    }
    setActiveTab(tab);
    window.history.replaceState(null, "", `#${tab}`);
  };

  useEffect(() => {
    if (!isTechnicalRole && activeTab !== "forecast") {
      setActiveTab("forecast");
    }
  }, [isTechnicalRole, activeTab]);

  // Persistent Shared State across all tabs
  const [season, setSeason] = useState<SeasonType>("Southwest Monsoon");
  const [leadTime, setLeadTime] = useState<HorizonHours>(24);
  const [apiStatus, setApiStatus] = useState<ApiStatusState>({
    nwp: true,
    ai: true,
    ensemble: true,
  });
  const [guidanceLog, setGuidanceLog] = useState<HumanGuidanceEntry[]>([]);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(() =>
    Boolean(session) || isTechnicalRole
  );
  const [lastBlendTime, setLastBlendTime] = useState<string>(
    () =>
      INITIAL_2025_TRAINED_SNAPSHOT.latest?.forecast_initialization_time ||
      "2025-12-21 12:30:00+00:00"
  );
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [pulseFlash, setPulseFlash] = useState<boolean>(false);

  // Live Backend Data State
  const [rawLatestResponse, setRawLatestResponse] = useState<any>(
    () => INITIAL_2025_TRAINED_SNAPSHOT.latest
  );
  const [districtTimelinesMap, setDistrictTimelinesMap] = useState<
    Record<string, any[]>
  >(() => INITIAL_2025_TRAINED_SNAPSHOT.timelines || {});
  const [weightsData, setWeightsData] = useState<any>(
    () => INITIAL_2025_TRAINED_SNAPSHOT.weights
  );
  const [evaluationData, setEvaluationData] = useState<any>(
    () => INITIAL_2025_TRAINED_SNAPSHOT.evaluation
  );
  const [shapData, setShapData] = useState<any>(
    () => INITIAL_2025_TRAINED_SNAPSHOT.shap
  );
  const [versionsData, setVersionsData] = useState<any>(
    () => INITIAL_2025_TRAINED_SNAPSHOT.versions
  );

  const [selectedDistrictName, setSelectedDistrictName] =
    useState<string>("Wayanad");
  const [hoveredDistrictName, setHoveredDistrictName] = useState<string | null>(
    null
  );
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  // Historical Analogs state
  const [analogYearsRange, setAnalogYearsRange] = useState<5 | 10 | 20>(10);
  const [sameDistrictOnly, setSameDistrictOnly] = useState<boolean>(true);
  const [matchedAnalogs, setMatchedAnalogs] = useState<
    MatchedHistoricalAnalog[]
  >(() =>
    mapRawHistoricalMatches(
      INITIAL_2025_TRAINED_SNAPSHOT.historical?.matches || []
    )
  );
  const [analogStatusMsg, setAnalogStatusMsg] = useState<string | undefined>(
    undefined
  );
  const [selectedAnalogId, setSelectedAnalogId] = useState<string | null>(null);
  const [analogHighlightDistrictId, setAnalogHighlightDistrictId] = useState<
    string | null
  >(null);

  const offlineSourcesList = useMemo(() => {
    const list: string[] = [];
    if (!apiStatus.nwp) list.push("nwp");
    if (!apiStatus.ai) list.push("ai");
    if (!apiStatus.ensemble) list.push("ensemble");
    return list;
  }, [apiStatus]);

  useEffect(() => {
    let cancelled = false;
    fetchLatestForecastApi({
      leadH: leadTime,
      season,
      offlineSources: offlineSourcesList,
      role: activeRole,
      token: session?.idToken,
    })
      .then((data) => {
        if (cancelled) return;
        setRawLatestResponse(data);
        setLastBlendTime(data.forecast_initialization_time || "2025 Cycle");
        if (data.operational_guidance) {
          setGuidanceLog(
            data.operational_guidance.map((g: any) => ({
              id: g.id,
              timestamp: g.timestamp,
              message: g.message,
              scope: g.scope,
              priority: g.priority,
              targetDistrictId: g.target_district,
              operator: g.operator,
            }))
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [leadTime, season, offlineSourcesList, activeRole, session?.idToken]);

  useEffect(() => {
    let cancelled = false;
    fetchDistrictTimelineApi({
      districtName: selectedDistrictName,
      season,
      offlineSources: offlineSourcesList,
      role: activeRole,
      token: session?.idToken,
    })
      .then((res) => {
        if (cancelled) return;
        if (res.horizons_6h_to_72h) {
          setDistrictTimelinesMap((prev) => ({
            ...prev,
            [selectedDistrictName]: res.horizons_6h_to_72h,
          }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    selectedDistrictName,
    season,
    offlineSourcesList,
    activeRole,
    session?.idToken,
  ]);

  useEffect(() => {
    if (!isTechnicalRole) return;
    fetchUnifiedWeightsApi({
      season,
      role: "technical",
      token: session?.idToken,
    })
      .then(setWeightsData)
      .catch(() => {});

    fetchEvaluationApi("technical", session?.idToken)
      .then(setEvaluationData)
      .catch(() => {});
    fetchShapApi("technical", session?.idToken)
      .then(setShapData)
      .catch(() => {});
    fetchModelVersionsApi("technical", session?.idToken)
      .then(setVersionsData)
      .catch(() => {});
  }, [isTechnicalRole, season, session?.idToken]);

  const allForecasts: ComputedDistrictForecast[] = useMemo(() => {
    const rawList: any[] = rawLatestResponse?.districts || [];
    const leadCurve = weightsData?.lead_time_weight_curve_6h_to_72h;
    return rawList.map((r) =>
      transformBackendDistrictToForecast(
        r,
        districtTimelinesMap[r.district],
        leadCurve
      )
    );
  }, [rawLatestResponse, districtTimelinesMap, weightsData]);

  const didAutoSelectRef = useRef<boolean>(false);
  useEffect(() => {
    if (!didAutoSelectRef.current && allForecasts.length > 0) {
      didAutoSelectRef.current = true;
      setSelectedDistrictName(allForecasts[0].district.name);
    }
  }, [allForecasts]);

  const selectedForecast: ComputedDistrictForecast | undefined = useMemo(
    () =>
      allForecasts.find(
        (f) =>
          f.district.name.toLowerCase() ===
            selectedDistrictName.toLowerCase() ||
          f.district.id.toLowerCase() === selectedDistrictName.toLowerCase()
      ) || allForecasts[0],
    [allForecasts, selectedDistrictName]
  );

  useEffect(() => {
    if (!selectedForecast) return;
    let cancelled = false;
    fetchHistoricalAnalogsApi({
      districtName: selectedForecast.district.name,
      rain6hMm: selectedForecast.rain6hMm ?? 35.0,
      season: selectedForecast.season,
      yearsRange: analogYearsRange,
      sameDistrictOnly,
      role: activeRole,
      token: session?.idToken,
    })
      .then((res) => {
        if (cancelled) return;
        setMatchedAnalogs(res.matches);
        setAnalogStatusMsg(res.message);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    selectedForecast?.district.name,
    selectedForecast?.rain6hMm,
    selectedForecast?.season,
    analogYearsRange,
    sameDistrictOnly,
    activeRole,
    session?.idToken,
  ]);

  const activeAnalogForOverlay = useMemo(
    () =>
      matchedAnalogs.find((a) => a.id === selectedAnalogId) ||
      matchedAnalogs[0],
    [matchedAnalogs, selectedAnalogId]
  );

  const triggerPulse = () => {
    setPulseFlash(true);
    setTimeout(() => setPulseFlash(false), 500);
  };

  const handleLeadTimeChange = (newLead: HorizonHours) => {
    setLeadTime(newLead);
    triggerPulse();
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const handleSelectDistrict = (districtNameOrId: string, openDrawer = false) => {
    const match = allForecasts.find(
      (f) =>
        f.district.name.toLowerCase() === districtNameOrId.toLowerCase() ||
        f.district.id.toLowerCase() === districtNameOrId.toLowerCase()
    );
    const canonicalName = match ? match.district.name : districtNameOrId;
    setSelectedDistrictName(canonicalName);
    if (openDrawer) {
      setDrawerOpen(true);
    }
  };

  const handleToggleApi = async (source: "nwp" | "ai" | "ensemble") => {
    const next = { ...apiStatus, [source]: !apiStatus[source] };
    setApiStatus(next);
    const label =
      source === "nwp"
        ? "NWP API"
        : source === "ai"
        ? "AI API"
        : "Ensemble API";
    try {
      await updateSourceAvailabilityApi(next, "technical", session?.idToken);
      showToast(
        next[source]
          ? `${label} restored online · 3-source blend recalculated.`
          : `${label} offline · Remaining source weights renormalized.`
      );
    } catch {
      showToast(`${label} updated · Unified blend recalculated.`);
    }
    triggerPulse();
  };

  const handleApplyGuidance = async (entry: {
    message: string;
    scope: string;
    priority: string;
    targetDistrictId: string;
  }) => {
    try {
      const res = await addOperationalGuidanceApi(
        {
          message: entry.message,
          scope: entry.scope,
          priority: entry.priority,
          target_district: entry.targetDistrictId,
        },
        "technical",
        session?.idToken
      );
      if (res.control_state?.operational_guidance) {
        setGuidanceLog(
          res.control_state.operational_guidance.map((g: any) => ({
            id: g.id,
            timestamp: g.timestamp,
            message: g.message,
            scope: g.scope,
            priority: g.priority,
            targetDistrictId: g.target_district,
            operator: g.operator,
          }))
        );
      }
      if (entry.targetDistrictId !== "all") {
        setSelectedDistrictName(entry.targetDistrictId);
      }
      showToast(
        `Operational guidance applied (${entry.priority}) · Forecast updated.`
      );
      const updated = await fetchLatestForecastApi({
        leadH: leadTime,
        season,
        offlineSources: offlineSourcesList,
        role: activeRole,
        token: session?.idToken,
      });
      setRawLatestResponse(updated);
      triggerPulse();
    } catch {
      showToast("Guidance applied locally.");
    }
  };

  const handleRevertGuidance = async (id: string) => {
    try {
      const res = await revertOperationalGuidanceApi(
        id,
        "technical",
        session?.idToken
      );
      if (res.control_state?.operational_guidance) {
        setGuidanceLog(
          res.control_state.operational_guidance.map((g: any) => ({
            id: g.id,
            timestamp: g.timestamp,
            message: g.message,
            scope: g.scope,
            priority: g.priority,
            targetDistrictId: g.target_district,
            operator: g.operator,
          }))
        );
      }
      const updated = await fetchLatestForecastApi({
        leadH: leadTime,
        season,
        offlineSources: offlineSourcesList,
        role: activeRole,
        token: session?.idToken,
      });
      setRawLatestResponse(updated);
      showToast("Guidance directive reverted.");
      triggerPulse();
    } catch {
      setGuidanceLog((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const scrollToAnalogs = () => {
    if (activeTab !== "forecast") {
      changeTab("forecast");
      setTimeout(() => {
        analogsSectionRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } else {
      analogsSectionRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const tickerAlerts = useMemo(
    () =>
      allForecasts.filter(
        (f) =>
          f.hasNativeStation &&
          (f.severity === "RED" ||
            f.severity === "ORANGE" ||
            f.severity === "YELLOW")
      ),
    [allForecasts]
  );

  const offlineApis: string[] = [];
  if (!apiStatus.nwp) offlineApis.push("NWP API");
  if (!apiStatus.ai) offlineApis.push("AI API");
  if (!apiStatus.ensemble) offlineApis.push("Ensemble API");

  const controlBadgeCount = guidanceLog.length + offlineApis.length;

  if (!selectedForecast) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#FAFAFE] text-slate-800">
      {/* ====================================================================
       * STICKY GLOBAL HEADER (CLEAN WHITE + VIOLET HEADING ACCENTS)
       * ==================================================================== */}
      <header className="sticky top-0 z-40 w-full bg-white border-b border-slate-200/80">
        <div className="max-w-[1440px] mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          {/* LEFT: FOREXA Logo + Tagline */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#6D28D9] flex items-center justify-center text-white shadow-sm">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-extrabold text-base tracking-tight text-[#6D28D9]">
                  FOREXA
                </span>
                <span className="text-slate-200">|</span>
                <span className="text-xs font-semibold text-slate-500">
                  Forecast Intelligence
                </span>
              </div>
            </div>
          </div>

          {/* CENTER: Navigation Tabs */}
          <nav
            className="flex items-center gap-2"
            aria-label="Primary dashboard navigation"
          >
            <button
              type="button"
              onClick={() => changeTab("forecast")}
              className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                activeTab === "forecast"
                  ? "bg-[#F5F3FF] text-[#6D28D9]"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{isTechnicalRole ? "Forecast" : "Authorities Forecast"}</span>
              {activeTab === "forecast" && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#6D28D9] rounded-full" />
              )}
            </button>

            {isTechnicalRole && (
              <>
                <button
                  type="button"
                  onClick={() => changeTab("insights")}
                  className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                    activeTab === "insights"
                      ? "bg-[#F5F3FF] text-[#6D28D9]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Model Insights</span>
                  {activeTab === "insights" && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#6D28D9] rounded-full" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => changeTab("visualization")}
                  className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                    activeTab === "visualization"
                      ? "bg-[#F5F3FF] text-[#6D28D9]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Visualization</span>
                  {activeTab === "visualization" && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#6D28D9] rounded-full" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => changeTab("control")}
                  className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                    activeTab === "control"
                      ? "bg-[#F5F3FF] text-[#6D28D9]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Control Room</span>
                  {controlBadgeCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#6D28D9] text-white">
                      {controlBadgeCount}
                    </span>
                  )}
                  {activeTab === "control" && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#6D28D9] rounded-full" />
                  )}
                </button>
              </>
            )}
          </nav>

          {/* RIGHT: Role Switcher, Global Filters, Admin Login */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Role Switcher */}
            <div className="inline-flex p-1 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setActiveRole("authority");
                  navigate("/authorities");
                }}
                className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition ${
                  !isTechnicalRole
                    ? "bg-white text-[#6D28D9] shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Shield className="w-3 h-3" />
                <span>Authorities</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveRole("technical");
                  navigate("/technical");
                }}
                className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition ${
                  isTechnicalRole
                    ? "bg-white text-[#6D28D9] shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Users className="w-3 h-3" />
                <span>Technical</span>
              </button>
            </div>

            {/* Season Dropdown */}
            <select
              aria-label="Select Season"
              value={season}
              onChange={(e) => {
                setSeason(e.target.value as SeasonType);
                triggerPulse();
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]"
            >
              <option value="Southwest Monsoon">Southwest Monsoon</option>
              <option value="Northeast Monsoon">Northeast Monsoon</option>
              <option value="Pre-Monsoon / Cyclone">
                Pre-Monsoon / Cyclone
              </option>
            </select>

            {/* Lead Time Dropdown */}
            <select
              aria-label="Select Forecast Lead Time"
              value={leadTime}
              onChange={(e) =>
                handleLeadTimeChange(Number(e.target.value) as HorizonHours)
              }
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-[#6D28D9] focus:outline-none focus:ring-2 focus:ring-[#6D28D9]"
            >
              {HORIZONS.map((h) => (
                <option key={h} value={h}>
                  Lead time: +{h} hours
                </option>
              ))}
            </select>

            {/* Admin Login / User Status Button */}
            {session ? (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-[#F5F3FF] text-[#6D28D9] text-xs font-semibold max-w-[130px] truncate">
                  {session.email.split("@")[0]}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await logoutUser();
                    onLogout?.();
                    navigate("/login");
                  }}
                  title="Sign out"
                  className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#4C1D95] text-white text-xs font-semibold shadow-sm transition"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Admin Login</span>
              </button>
            )}
          </div>
        </div>

        {/* Clean White Alert Ticker Bar */}
        <div
          className="w-full px-6 py-2.5 bg-white border-t border-slate-100 flex items-center gap-4 overflow-x-auto text-xs"
          role="region"
          aria-label="Active district advisories"
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#6D28D9] shrink-0">
            Active Advisories
          </span>

          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
            {tickerAlerts.map((alertItem) => (
              <button
                key={alertItem.district.name}
                type="button"
                onClick={() =>
                  handleSelectDistrict(alertItem.district.name, true)
                }
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition border ${
                  alertItem.district.name === selectedForecast.district.name
                    ? "bg-[#F5F3FF] text-[#6D28D9] border-purple-200 font-semibold"
                    : "bg-white text-slate-600 border-slate-200 hover:border-purple-200 hover:text-slate-900"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#6D28D9]" />
                <strong className="text-slate-900">
                  {alertItem.district.name}
                </strong>
                <span>· {alertItem.eventType}</span>
                <span className="text-slate-400">
                  · {alertItem.rain6hMm} mm/6h
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Global Banner when any API is offline */}
        {offlineApis.length > 0 && (
          <div
            className="w-full px-6 py-2.5 bg-[#F5F3FF] border-t border-purple-200 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-800"
            role="alert"
          >
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-[#6D28D9] shrink-0" />
              <span>
                {offlineApis.length === 3
                  ? "No model available · All 3 forecast APIs are currently offline."
                  : `${offlineApis.join(
                      " & "
                    )} offline · Blend redistributed to active models (NWP ${
                      selectedForecast.weights.nwp
                    }% · AI ${selectedForecast.weights.ai}% · Ensemble ${
                      selectedForecast.weights.ensemble
                    }%).`}
              </span>
            </div>
            {isTechnicalRole && (
              <button
                type="button"
                onClick={async () => {
                  const full = { nwp: true, ai: true, ensemble: true };
                  setApiStatus(full);
                  await updateSourceAvailabilityApi(
                    full,
                    "technical",
                    session?.idToken
                  );
                  showToast("All 3 model APIs restored online.");
                }}
                className="px-3 py-1 rounded-lg bg-[#6D28D9] text-white text-xs font-semibold shadow-sm"
              >
                Restore All 3 APIs
              </button>
            )}
          </div>
        )}
      </header>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-white text-slate-800 border border-purple-200 px-5 py-3.5 rounded-2xl shadow-lg flex items-center gap-3 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-[#6D28D9] shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ====================================================================
       * SPACIOUS MAIN CONTENT CONTAINER
       * ==================================================================== */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-8 space-y-8">
        {activeTab === "forecast" && (
          <>
            {/* ==============================================================
             * 3.1 PREDICTION TIMELINE
             * ============================================================== */}
            <section
              className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm"
              aria-label="Prediction timeline control"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#6D28D9]">
                    Forecast Window
                  </span>
                  <div className="flex flex-wrap items-center gap-4 mt-1">
                    <h1 className="text-lg font-bold text-slate-900">
                      Prediction Timeline
                    </h1>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
                      <Clock className="w-3.5 h-3.5 text-[#6D28D9]" />
                      Valid: {selectedForecast.validTime}
                    </span>
                  </div>
                </div>

                {/* Segmented Toggle */}
                <div
                  className="inline-flex p-1 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold"
                  role="group"
                  aria-label="Forecast range preset"
                >
                  {(
                    [
                      {
                        label: "Near term",
                        target: 12 as HorizonHours,
                        isMatch: leadTime < 24,
                      },
                      {
                        label: "24 hours",
                        target: 24 as HorizonHours,
                        isMatch: leadTime === 24,
                      },
                      {
                        label: "Extended",
                        target: 72 as HorizonHours,
                        isMatch: leadTime > 24,
                      },
                    ]
                  ).map((seg) => (
                    <button
                      key={seg.label}
                      type="button"
                      onClick={() => handleLeadTimeChange(seg.target)}
                      className={`px-3.5 py-1.5 rounded-lg transition ${
                        seg.isMatch
                          ? "bg-[#6D28D9] text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {seg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Horizon Slider */}
              <div className="px-1">
                <input
                  type="range"
                  min={0}
                  max={HORIZONS.length - 1}
                  step={1}
                  value={HORIZONS.indexOf(leadTime)}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    handleLeadTimeChange(HORIZONS[idx]);
                  }}
                  aria-label="Forecast horizon slider from 6 hours to 72 hours"
                  className="w-full accent-[#6D28D9] h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                />
                <div className="flex flex-wrap items-center justify-between gap-1 mt-3">
                  {HORIZONS.map((h) => {
                    const active = h === leadTime;
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => handleLeadTimeChange(h)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                          active
                            ? "bg-[#6D28D9] text-white shadow-sm"
                            : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        +{h}h
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* ==============================================================
             * 3.2 THREE-COLUMN MAIN AREA
             * ============================================================== */}
            <section
              className={`grid grid-cols-1 lg:grid-cols-12 gap-7 items-start ${
                pulseFlash ? "animate-purple-flash" : ""
              }`}
            >
              {/* LEFT COLUMN: DISTRICT PRIORITY LIST */}
              <div className="lg:col-span-3 rounded-2xl bg-white border border-slate-200/90 shadow-sm overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-[#6D28D9]">
                      District Priority
                    </h2>
                    <span className="text-xs font-semibold text-slate-500">
                      +{leadTime}h
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    14 districts ranked by event intensity
                  </p>
                </div>

                <div
                  className="max-h-[550px] overflow-y-auto divide-y divide-slate-100 p-3 space-y-2"
                  role="listbox"
                  aria-label="Ranked Kerala districts priority list"
                >
                  {allForecasts.map((item) => {
                    const isSelected =
                      item.district.name === selectedForecast.district.name;

                    return (
                      <div
                        key={item.district.name}
                        role="option"
                        aria-selected={isSelected}
                        tabIndex={0}
                        onMouseEnter={() =>
                          setHoveredDistrictName(item.district.name)
                        }
                        onMouseLeave={() => setHoveredDistrictName(null)}
                        onClick={() =>
                          handleSelectDistrict(item.district.name, true)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleSelectDistrict(item.district.name, true);
                          }
                        }}
                        className={`rounded-xl p-3.5 cursor-pointer transition-all duration-150 bg-white border ${
                          isSelected
                            ? "border-[#6D28D9] ring-1 ring-[#6D28D9] bg-[#F5F3FF]/40"
                            : "border-slate-100 hover:border-purple-200 hover:bg-slate-50/60"
                        }`}
                      >
                        {item.isCycloneAffected && (
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F5F3FF] text-[#6D28D9] text-[10px] font-bold">
                              <CycloneSpiralIcon className="w-3 h-3" />
                              <span>Cyclonic System</span>
                            </span>
                            <span className="text-[11px] font-medium text-slate-500">
                              {item.currentPoint.windMs} m/s
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? "bg-[#6D28D9] text-white"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {item.rank}
                            </span>
                            <span className="font-bold text-sm text-slate-900 truncate">
                              {item.district.name}
                            </span>
                          </div>

                          {item.hasNativeStation ? (
                            <SeverityChip severity={item.severity} size="xs" />
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                              Unmonitored
                            </span>
                          )}
                        </div>

                        <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-slate-600">
                          <div className="truncate">
                            {item.hasNativeStation ? (
                              <>
                                <span className="font-semibold text-slate-900">
                                  {item.rain6hMm ?? "—"} mm/6h
                                </span>
                                <span className="mx-1.5 text-slate-300">·</span>
                                <span>{item.eventType}</span>
                              </>
                            ) : (
                              <span className="text-slate-400">
                                No station coverage
                              </span>
                            )}
                          </div>

                          <MiniSparkline
                            series={item.hourlySeries}
                            severity={item.severity}
                            activeHorizon={leadTime}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CENTER COLUMN: KERALA IMPACT MAP */}
              <div className="lg:col-span-5">
                <KeralaImpactMap
                  forecasts={allForecasts}
                  selectedDistrictId={selectedForecast.district.name}
                  hoveredDistrictId={hoveredDistrictName}
                  analogHighlightDistrictId={analogHighlightDistrictId}
                  leadTime={leadTime}
                  darkMode={false}
                  onSelectDistrict={handleSelectDistrict}
                  onHoverDistrict={setHoveredDistrictName}
                  onResetSelection={() => {
                    setDrawerOpen(false);
                    setAnalogHighlightDistrictId(null);
                  }}
                />
              </div>

              {/* RIGHT COLUMN: FINAL FORECAST CARD (CLEAN WHITE + VIOLET HEADING) */}
              <div className="lg:col-span-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm overflow-hidden">
                <div className="h-1.5 w-full bg-[#6D28D9]" />

                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[#6D28D9]">
                      Final Forecast · +{leadTime}h
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                      Blended Output · {selectedForecast.district.name}
                    </h2>
                  </div>
                  {selectedForecast.hasNativeStation ? (
                    <SeverityChip
                      severity={selectedForecast.severity}
                      size="sm"
                    />
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                      Unmonitored
                    </span>
                  )}
                </div>

                <div className="p-6 space-y-5">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#F5F3FF] text-[#6D28D9] flex items-center justify-center shrink-0">
                      <EventIcon
                        type={selectedForecast.iconType}
                        className="w-6 h-6"
                      />
                    </div>
                    <div>
                      <div className="text-base font-bold text-slate-900">
                        {selectedForecast.eventType}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {selectedForecast.conditionSummary}
                      </p>
                    </div>
                  </div>

                  {selectedForecast.hasNativeStation && (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 grid grid-cols-3 gap-3 text-center">
                      <div>
                        <div className="text-[11px] font-semibold text-[#6D28D9]">
                          6h Rainfall
                        </div>
                        <div className="text-base font-bold text-slate-900 mt-1">
                          {selectedForecast.rain6hMm ?? "—"} mm
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-[#6D28D9]">
                          Temp / RH
                        </div>
                        <div className="text-sm font-bold text-slate-900 mt-1">
                          {selectedForecast.currentPoint.tempC ?? "—"}°C ·{" "}
                          {selectedForecast.currentPoint.humidityPct ?? "—"}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-[#6D28D9]">
                          Wind / Press
                        </div>
                        <div className="text-xs font-bold text-slate-900 mt-1">
                          {selectedForecast.currentPoint.windMs ?? "—"} m/s ·{" "}
                          {selectedForecast.currentPoint.pressureHpa ?? "—"}{" "}
                          hPa
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Source Contribution Percentages (Technical Role Only; Authorities see ONLY Final Blended Forecast) */}
                  {isTechnicalRole && (
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold text-[#6D28D9] mb-2">
                        <span>Adaptive Source Contributions</span>
                        <span className="text-[11px] font-medium text-slate-400">
                          Unified Weights
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                          <div className="text-[11px] font-medium text-slate-500">
                            NWP
                          </div>
                          <div className="text-base font-bold text-slate-900 mt-0.5">
                            {selectedForecast.weights.nwp}%
                          </div>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                          <div className="text-[11px] font-medium text-slate-500">
                            AI
                          </div>
                          <div className="text-base font-bold text-slate-900 mt-0.5">
                            {selectedForecast.weights.ai}%
                          </div>
                        </div>
                        <div className="p-3 rounded-xl bg-[#F5F3FF] border border-purple-200 text-center">
                          <div className="text-[11px] font-semibold text-[#6D28D9]">
                            Ensemble
                          </div>
                          <div className="text-base font-bold text-[#6D28D9] mt-0.5">
                            {selectedForecast.weights.ensemble}%
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Expected Onset & Likely Impact */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">
                        Expected onset:
                      </span>
                      <span className="font-bold text-slate-900">
                        +{selectedForecast.leadTimeHours}h (6h window)
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-500 font-medium shrink-0">
                        Likely impact:
                      </span>
                      <span className="font-semibold text-slate-800 text-right">
                        {selectedForecast.possibleImpacts.length > 0
                          ? selectedForecast.possibleImpacts[0]
                          : "Normal conditions"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">
                        Confidence:
                      </span>
                      <span className="font-bold text-[#6D28D9]">
                        {selectedForecast.confidence}
                      </span>
                    </div>
                  </div>

                  {selectedForecast.activeGuidanceNote && (
                    <div className="p-3.5 rounded-xl bg-[#F5F3FF] border border-purple-200 text-slate-800 text-xs">
                      <div className="font-bold text-[#6D28D9] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Active Control Room Guidance</span>
                      </div>
                      <p className="mt-1 font-medium">
                        “{selectedForecast.activeGuidanceNote}”
                      </p>
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={scrollToAnalogs}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6D28D9] hover:underline"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>
                        Similar to:{" "}
                        {matchedAnalogs[0]?.monthYearLabel ||
                          "Historical Archive"}
                      </span>
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setDrawerOpen(true)}
                      className="px-4 py-2 rounded-xl bg-[#F5F3FF] hover:bg-[#6D28D9] text-[#6D28D9] hover:text-white text-xs font-semibold transition"
                    >
                      Full Details
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* ==============================================================
             * 3.4 RAINFALL OVER TIME
             * ============================================================== */}
            <section>
              <RainfallOverTimeChart
                forecast={selectedForecast}
                leadTime={leadTime}
                darkMode={false}
                isTechnicalRole={isTechnicalRole}
                onSelectLeadTime={handleLeadTimeChange}
              />
            </section>

            {/* ==============================================================
             * 3.5 HISTORICAL ANALOGS ("Has this happened before?")
             * ============================================================== */}
            <section
              ref={analogsSectionRef}
              className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 space-y-6 shadow-sm"
              aria-label="Historical weather analogs comparison"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#6D28D9]">
                    Historical Context
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 mt-1">
                    Has This Happened Before?
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Matched on rainfall intensity, duration, terrain, and season
                    against verified observation records
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex p-1 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold">
                    {([5, 10, 20] as const).map((yr) => (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => setAnalogYearsRange(yr)}
                        className={`px-3 py-1.5 rounded-lg transition ${
                          analogYearsRange === yr
                            ? "bg-[#6D28D9] text-white"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {yr} years
                      </button>
                    ))}
                  </div>

                  <div className="inline-flex p-1 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setSameDistrictOnly(true)}
                      className={`px-3.5 py-1.5 rounded-lg transition ${
                        sameDistrictOnly
                          ? "bg-[#6D28D9] text-white"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Same district only
                    </button>
                    <button
                      type="button"
                      onClick={() => setSameDistrictOnly(false)}
                      className={`px-3.5 py-1.5 rounded-lg transition ${
                        !sameDistrictOnly
                          ? "bg-[#6D28D9] text-white"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Anywhere in Kerala
                    </button>
                  </div>
                </div>
              </div>

              {matchedAnalogs.length === 0 ? (
                <div className="p-8 rounded-2xl border border-slate-200 bg-slate-50 text-center text-xs">
                  <div className="font-bold text-[#6D28D9] text-sm mb-1">
                    No Historical Observation Records Available for This Filter
                  </div>
                  <p className="text-slate-500">
                    {analogStatusMsg ||
                      "Switch to 'Anywhere in Kerala' to compare against monitored districts."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    {matchedAnalogs.map((analog, idx) => {
                      const isActiveAnalog =
                        activeAnalogForOverlay?.id === analog.id;
                      const rp = analog.retrospectiveModelPerformance;

                      return (
                        <div
                          key={analog.id}
                          onClick={() => {
                            setSelectedAnalogId(analog.id);
                            setAnalogHighlightDistrictId(analog.districtName);
                            showToast(
                              `Selected ${analog.districtName} (${analog.dateRange}) for curve comparison.`
                            );
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedAnalogId(analog.id);
                              setAnalogHighlightDistrictId(analog.districtName);
                            }
                          }}
                          className={`rounded-2xl border p-5 cursor-pointer transition-all duration-200 flex flex-col justify-between bg-white ${
                            isActiveAnalog
                              ? "border-[#6D28D9] ring-1 ring-[#6D28D9] shadow-sm"
                              : "border-slate-200 hover:border-purple-300"
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div>
                                <span className="text-[11px] font-semibold text-[#6D28D9]">
                                  Match #{idx + 1} · {analog.year}
                                </span>
                                <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                                  {analog.districtName} · {analog.dateRange}
                                </h3>
                              </div>
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#F5F3FF] text-[#6D28D9] shrink-0">
                                {analog.similarityPct}%
                              </span>
                            </div>

                            <div className="space-y-2 my-3 text-xs text-slate-600">
                              <div className="flex justify-between font-semibold text-slate-800">
                                <span>Observed 6h Rain:</span>
                                <span>{analog.recordedRain6hMm} mm</span>
                              </div>
                              {rp && rp.blended_forecast_6h_mm !== null && (
                                <div className="flex justify-between font-semibold text-[#6D28D9]">
                                  <span>Blended Forecast Then:</span>
                                  <span>{rp.blended_forecast_6h_mm} mm</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span>Temp &amp; Wind:</span>
                                <span>
                                  {analog.tempC}°C · {analog.windMs} m/s
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Condition:</span>
                                <span className="font-medium text-slate-800">
                                  {analog.weatherCondition}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold">
                            <span className="text-slate-400">Regime:</span>
                            <span className="text-[#6D28D9]">
                              {analog.eventType.replace(/_/g, " ")}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {activeAnalogForOverlay && (
                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                      <div className="lg:col-span-8">
                        <AnalogOverlayChart
                          forecast={selectedForecast}
                          analog={activeAnalogForOverlay}
                          darkMode={false}
                        />
                      </div>

                      <div className="lg:col-span-4 space-y-2.5 text-xs text-slate-600">
                        <div className="p-4 rounded-xl bg-white border border-slate-200">
                          <div className="text-xs font-bold text-[#6D28D9]">
                            Historical Match Insight
                          </div>
                          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                            Comparing current +{leadTime}h trajectory in{" "}
                            <strong className="text-slate-900">
                              {selectedForecast.district.name}
                            </strong>{" "}
                            against the observed profile from{" "}
                            <strong className="text-slate-900">
                              {activeAnalogForOverlay.monthYearLabel}
                            </strong>{" "}
                            ({activeAnalogForOverlay.similarityPct}% similarity).
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}

        {/* ================================================================
         * 4. TAB 2: MODEL INSIGHTS
         * ================================================================ */}
        {activeTab === "insights" && isTechnicalRole && (
          <ModelInsightsTab
            selectedForecast={selectedForecast}
            allForecasts={allForecasts}
            analogs={matchedAnalogs}
            evaluationData={evaluationData}
            shapData={shapData}
            weightsData={weightsData}
            versionsData={versionsData}
            leadTime={leadTime}
            darkMode={false}
            onSelectDistrict={(name) => handleSelectDistrict(name, false)}
          />
        )}

        {/* ================================================================
         * 5. TAB 3: VISUALIZATION (DYNAMIC BLENDING & SIMULATORS)
         * ================================================================ */}
        {activeTab === "visualization" && isTechnicalRole && (
          <VisualizationTab
            allForecasts={allForecasts}
            selectedForecast={selectedForecast}
            leadTime={leadTime}
            session={session}
            onSelectDistrict={(name) => handleSelectDistrict(name, false)}
          />
        )}

        {/* ================================================================
         * 6. TAB 4: CONTROL ROOM
         * ================================================================ */}
        {activeTab === "control" && isTechnicalRole && (
          <ControlRoomTab
            selectedForecast={selectedForecast}
            allForecasts={allForecasts}
            apiStatus={apiStatus}
            guidanceLog={guidanceLog}
            isAdminUnlocked={isAdminUnlocked}
            session={session}
            lastBlendTime={lastBlendTime}
            darkMode={false}
            onToggleApi={handleToggleApi}
            onApplyGuidance={handleApplyGuidance}
            onRevertGuidance={handleRevertGuidance}
            onUnlockAdmin={() => {
              setIsAdminUnlocked(true);
              showToast("Control Room unlocked.");
            }}
            onNavigateLogin={() => navigate("/login")}
          />
        )}
      </main>

      {/* ====================================================================
       * 3.3 DISTRICT DETAIL DRAWER
       * ==================================================================== */}
      <DistrictDetailDrawer
        open={drawerOpen}
        forecast={selectedForecast}
        allForecasts={allForecasts}
        bestAnalog={matchedAnalogs[0]}
        leadTime={leadTime}
        darkMode={false}
        isTechnicalRole={isTechnicalRole}
        onClose={() => setDrawerOpen(false)}
        onJumpToInsights={() => changeTab("insights")}
        onJumpToAnalogs={scrollToAnalogs}
      />

      {/* ====================================================================
       * GLOBAL FOOTER
       * ==================================================================== */}
      <footer className="w-full bg-white border-t border-slate-200/80 px-6 py-5 text-center text-xs text-slate-500">
        FOREXA · Hybrid AI–NWP Adaptive Forecast Blending Platform for Kerala ·
        Boundary data © OpenStreetMap contributors
      </footer>
    </div>
  );
};
