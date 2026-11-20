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
  MapPin,
  Send,
  Phone,
} from "lucide-react";
import {
  addOperationalGuidanceApi,
  ApiStatusState,
  ComputedDistrictForecast,
  dispatchFinalDistrictReportApi,
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
  registerPrototypeMobileApi,
  revertOperationalGuidanceApi,
  SeasonType,
  stepLiveStreamApi,
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
import { TimeLoopTab } from "./TimeLoopTab";
import { InstallAppButton } from "./InstallAppButton";
import {
  getStoredPrototypeMobile,
  getUserInitials,
  logoutUser,
  setStoredPrototypeMobile,
  trackAnalyticsEvent,
  triggerNativeOfflineSms,
  UserSession,
  validateMobileNumber,
} from "../firebase";

export type DashboardTab =
  | "forecast"
  | "insights"
  | "visualization"
  | "control"
  | "timeloop";

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
    (session?.role === "technical" ? "technical" : undefined) ||
    (location.pathname.includes("authorities") ? "authority" : "technical");

  const [activeRole, setActiveRole] = useState<"authority" | "technical">(
    initialRole
  );
  const [prototypeMobile, setPrototypeMobile] = useState<string>(
    () => session?.receiverMobile || getStoredPrototypeMobile()
  );
  const [dispatchingReport, setDispatchingReport] = useState<boolean>(false);

  useEffect(() => {
    if (forcedRole) {
      setActiveRole(forcedRole);
    } else if (session?.role === "technical" || session?.role === "authority") {
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
      hash === "timeloop" ||
      hash === "forecast"
    ) {
      return hash;
    }
    return "forecast";
  });

  // Live Stream Toggle Switch (10-second demo interval -> updates NWP, AI & Ensemble predictions in Model Insights)
  const [liveStreamEnabled, setLiveStreamEnabled] = useState<boolean>(false);
  const [liveCountdownSec, setLiveCountdownSec] = useState<number>(10);
  const [liveTickCount, setLiveTickCount] = useState<number>(0);
  const [liveStreamSnapshot, setLiveStreamSnapshot] = useState<any>(null);

  const changeTab = (tab: DashboardTab) => {
    if (
      !isTechnicalRole &&
      (tab === "insights" ||
        tab === "visualization" ||
        tab === "control" ||
        tab === "timeloop")
    ) {
      showToast(
        "Authorities view displays only the Final Blended Forecast & Priority Districts."
      );
      return;
    }
    setActiveTab(tab);
    window.history.replaceState(null, "", `#${tab}`);
    trackAnalyticsEvent("switch_dashboard_tab", { tab, role: activeRole });
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

  // Live Backend Data State (persisted to localStorage for instant offline viewing)
  const [rawLatestResponse, setRawLatestResponse] = useState<any>(() => {
    try {
      const cached = localStorage.getItem("forexa_offline_latest_forecast");
      if (cached) return JSON.parse(cached);
    } catch {
      // ignore
    }
    return INITIAL_2025_TRAINED_SNAPSHOT.latest;
  });
  const [browserOnline, setBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setBrowserOnline(true);
    const onOffline = () => setBrowserOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);
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

  const runLiveStreamUpdate = () => {
    stepLiveStreamApi(1, selectedDistrictName, null, session?.idToken)
      .then((res) => {
        if (!res?.districts) return;
        setLiveStreamSnapshot(res);
        setLiveTickCount((c) => c + 1);
        setLastBlendTime(res.simulated_timestamp_utc || "Live Stream");
        setRawLatestResponse((prevLatest: any) => {
          if (!prevLatest?.districts) return prevLatest;
          const byName: Record<string, any> = {};
          res.districts.forEach((d: any) => {
            byName[String(d.district).toLowerCase()] = d;
          });
          const updatedDistricts = prevLatest.districts.map((orig: any) => {
            const match = byName[String(orig.district).toLowerCase()];
            if (!match) return orig;
            return {
              ...orig,
              blended_forecast: {
                ...(orig.blended_forecast || {}),
                ...match.blended,
              },
              unified_weights: {
                ...(orig.unified_weights || {}),
                W_NWP_pct:
                  res.unified_weights?.W_NWP_pct ??
                  orig.unified_weights?.W_NWP_pct,
                W_AI_pct:
                  res.unified_weights?.W_AI_pct ??
                  orig.unified_weights?.W_AI_pct,
                W_Ensemble_pct:
                  res.unified_weights?.W_Ensemble_pct ??
                  orig.unified_weights?.W_Ensemble_pct,
              },
            };
          });
          return { ...prevLatest, districts: updatedDistricts };
        });
        showToast(
          `Live Stream updated NWP, AI & Ensemble predictions in Model Insights · ${res.event_phase || "Active Weather Update"}`
        );
        triggerPulse();
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!liveStreamEnabled || !isTechnicalRole) {
      setLiveCountdownSec(10);
      return;
    }
    // Wait 10 seconds first (not immediate), then update NWP, AI & Ensemble predictions in Model Insights every 10s
    setLiveCountdownSec(10);
    const timer = setInterval(() => {
      setLiveCountdownSec((prev) => {
        if (prev <= 1) {
          runLiveStreamUpdate();
          return 10;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [liveStreamEnabled, isTechnicalRole, selectedDistrictName, session?.idToken]);

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
        try {
          localStorage.setItem(
            "forexa_offline_latest_forecast",
            JSON.stringify(data)
          );
        } catch {
          // ignore storage quota
        }
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
    <div className="min-h-screen flex flex-col justify-between bg-[#F4F9F6] text-slate-800">
      {/* ====================================================================
       * STICKY GLOBAL HEADER (CLEAN WHITE + VIOLET HEADING ACCENTS)
       * ==================================================================== */}
      <header className="sticky top-0 z-40 w-full bg-white border-b border-slate-200/80">
        <div className="max-w-[1440px] mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          {/* LEFT: FOREXA Logo + Tagline */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#14532D] flex items-center justify-center text-white shadow-sm">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-extrabold text-base tracking-tight text-[#14532D]">
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
                  ? "bg-[#ECFDF5] text-[#14532D]"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{isTechnicalRole ? "Forecast" : "Authorities Forecast"}</span>
              {activeTab === "forecast" && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#14532D] rounded-full" />
              )}
            </button>

            {isTechnicalRole && (
              <>
                <button
                  type="button"
                  onClick={() => changeTab("insights")}
                  className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                    activeTab === "insights"
                      ? "bg-[#ECFDF5] text-[#14532D]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Model Insights</span>
                  {activeTab === "insights" && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#14532D] rounded-full" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => changeTab("visualization")}
                  className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                    activeTab === "visualization"
                      ? "bg-[#ECFDF5] text-[#14532D]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Visualization</span>
                  {activeTab === "visualization" && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#14532D] rounded-full" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => changeTab("control")}
                  className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                    activeTab === "control"
                      ? "bg-[#ECFDF5] text-[#14532D]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Control Room</span>
                  {controlBadgeCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#14532D] text-white">
                      {controlBadgeCount}
                    </span>
                  )}
                  {activeTab === "control" && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#14532D] rounded-full" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => changeTab("timeloop")}
                  className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                    activeTab === "timeloop"
                      ? "bg-[#ECFDF5] text-[#14532D]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>TimeLoop</span>
                  {activeTab === "timeloop" && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#14532D] rounded-full" />
                  )}
                </button>
              </>
            )}
          </nav>

          {/* RIGHT: Install App + Live Stream Switch (Technical Only) + Lead Time + Initials Avatar */}
          <div className="flex flex-wrap items-center gap-3">
            <InstallAppButton />
            {isTechnicalRole && (
              <button
                type="button"
                role="switch"
                aria-checked={liveStreamEnabled}
                onClick={() => {
                  const next = !liveStreamEnabled;
                  setLiveStreamEnabled(next);
                  setLiveCountdownSec(10);
                  showToast(
                    next
                      ? "Live Stream started · NWP, AI & Ensemble predictions will update in 10 seconds inside the Model Insights tab. Please go to Model Insights."
                      : "Live Stream paused."
                  );
                }}
                className={`inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
                  liveStreamEnabled
                    ? "bg-[#ECFDF5] border-[#15803D] text-[#14532D]"
                    : "bg-white border-slate-200 text-slate-600 hover:border-emerald-200"
                }`}
              >
                <span
                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                    liveStreamEnabled ? "bg-[#15803D]" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      liveStreamEnabled ? "translate-x-3.5" : "translate-x-0.5"
                    }`}
                  />
                </span>
                <span>
                  {liveStreamEnabled
                    ? `Live (${liveCountdownSec}s${liveTickCount > 0 ? ` · #${liveTickCount}` : ""})`
                    : "Live Stream"}
                </span>
              </button>
            )}

            {/* Lead Time Dropdown */}
            <select
              aria-label="Select Forecast Lead Time"
              value={leadTime}
              onChange={(e) =>
                handleLeadTimeChange(Number(e.target.value) as HorizonHours)
              }
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-[#14532D] focus:outline-none focus:ring-2 focus:ring-[#15803D]"
            >
              {HORIZONS.map((h) => (
                <option key={h} value={h}>
                  Lead time: +{h} hours
                </option>
              ))}
            </select>

            {/* Professional Initials Avatar Badge (First & Last Letter + Role) */}
            {session && (
              <div className="flex items-center gap-2.5">
                <div className="inline-flex items-center gap-2.5 pl-1.5 pr-3.5 py-1 rounded-full bg-[#ECFDF5] border border-emerald-200">
                  <span className="w-7 h-7 rounded-full bg-[#14532D] text-white text-xs font-bold flex items-center justify-center">
                    {getUserInitials(session.email)}
                  </span>
                  <div className="leading-tight">
                    <div className="text-xs font-bold text-[#14532D]">
                      {isTechnicalRole ? "Technical Specialist" : "State Authority"}
                    </div>
                    <div className="text-[10px] font-medium text-emerald-800/80">
                      Kerala
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
                  className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Clean White Alert Ticker Bar */}
        <div
          className="w-full px-6 py-2.5 bg-white border-t border-slate-100 flex items-center gap-4 overflow-x-auto text-xs"
          role="region"
          aria-label="Active district advisories"
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#14532D] shrink-0">
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
                    ? "bg-[#ECFDF5] text-[#14532D] border-emerald-200 font-semibold"
                    : "bg-white text-slate-600 border-slate-200 hover:border-emerald-200 hover:text-slate-900"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#14532D]" />
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
            className="w-full px-6 py-2.5 bg-[#ECFDF5] border-t border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-800"
            role="alert"
          >
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-[#14532D] shrink-0" />
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
                className="px-3 py-1 rounded-lg bg-[#14532D] text-white text-xs font-semibold shadow-sm"
              >
                Restore All 3 APIs
              </button>
            )}
          </div>
        )}
      </header>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-white text-slate-800 border border-emerald-200 px-5 py-3.5 rounded-2xl shadow-lg flex items-center gap-3 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-[#14532D] shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ====================================================================
       * SPACIOUS MAIN CONTENT CONTAINER
       * ==================================================================== */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-8 space-y-8">
        {!browserOnline && (
          <div className="rounded-2xl bg-red-50 border border-red-300 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-red-800 font-semibold">
            <span>
              Offline Mode — Displaying cached Kerala forecast data. Cellular
              SIM SMS dispatch remains available.
            </span>
            {!isTechnicalRole && (
              <button
                type="button"
                onClick={() => {
                  const smsBody = `[FOREXA ${selectedForecast.severity} ALERT] ${selectedForecast.district.name.toUpperCase()}: ${selectedForecast.eventType} (${selectedForecast.rain6hMm ?? "—"}mm/6h, Wind ${selectedForecast.currentPoint.windMs ?? "—"}m/s) onset +${leadTime}h. Activate district emergency protocol.`;
                  const res = triggerNativeOfflineSms(prototypeMobile, smsBody);
                  showToast(
                    res.launched
                      ? `Opening Offline SIM SMS to ${res.target}`
                      : res.error ||
                          "Enter a valid 10-digit receiver mobile number first."
                  );
                }}
                className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition"
              >
                Send Offline SIM SMS →
              </button>
            )}
          </div>
        )}

        {isTechnicalRole && liveStreamEnabled && (
          <div className="rounded-2xl bg-[#ECFDF5] border border-emerald-300 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[#14532D]">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#15803D] animate-pulse shrink-0" />
              <span>
                <strong>Simulated Real-Time Stream (10-second interval):</strong>{" "}
                NWP, AI, and Ensemble model predictions will update after{" "}
                <strong>10 seconds</strong> inside{" "}
                <strong>Model Insights</strong> (please switch to Model Insights
                to view live updates). Instead of a live external weather API,
                updates are simulated every 10s here; in live operational
                deployment, forecast feeds update every{" "}
                <strong>30 minutes to 1 hour</strong>.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {activeTab !== "insights" && (
                <button
                  type="button"
                  onClick={() => changeTab("insights")}
                  className="px-3 py-1.5 rounded-lg bg-[#14532D] hover:bg-[#052E16] text-white font-bold text-xs transition"
                >
                  Go to Model Insights →
                </button>
              )}
              <span className="font-bold px-3 py-1 rounded-full bg-white border border-emerald-200">
                Next update in {liveCountdownSec}s
              </span>
            </div>
          </div>
        )}

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
                  <span className="text-xs font-bold uppercase tracking-wider text-[#14532D]">
                    Forecast Window
                  </span>
                  <div className="flex flex-wrap items-center gap-4 mt-1">
                    <h1 className="text-lg font-bold text-slate-900">
                      Prediction Timeline
                    </h1>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
                      <Clock className="w-3.5 h-3.5 text-[#14532D]" />
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
                          ? "bg-[#14532D] text-white shadow-sm"
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
                  className="w-full accent-[#14532D] h-1.5 bg-slate-200 rounded-lg cursor-pointer"
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
                            ? "bg-[#14532D] text-white shadow-sm"
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
                    <h2 className="text-base font-bold text-[#14532D]">
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
                            ? "border-[#14532D] ring-1 ring-[#14532D] bg-[#ECFDF5]/40"
                            : "border-slate-100 hover:border-emerald-200 hover:bg-slate-50/60"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? "bg-[#14532D] text-white"
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

                        <div className="mt-2 text-xs text-slate-600 truncate">
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
                <div className="h-1.5 w-full bg-[#14532D]" />

                <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-[#14532D]">
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
                    <div className="w-12 h-12 rounded-2xl bg-[#ECFDF5] text-[#14532D] flex items-center justify-center shrink-0">
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
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 p-3.5 rounded-xl bg-[#F4F9F6] border border-emerald-200/80 flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#14532D]">
                          6h Blended Rainfall
                        </span>
                        <span className="text-lg font-extrabold text-slate-900">
                          {selectedForecast.rain6hMm ?? "—"} mm
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                        <div className="text-[11px] font-semibold text-[#15803D]">
                          Temperature
                        </div>
                        <div className="text-base font-bold text-slate-900 mt-1">
                          {selectedForecast.currentPoint.tempC ?? "—"} °C
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                        <div className="text-[11px] font-semibold text-[#15803D]">
                          Humidity
                        </div>
                        <div className="text-base font-bold text-slate-900 mt-1">
                          {selectedForecast.currentPoint.humidityPct ?? "—"} %
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                        <div className="text-[11px] font-semibold text-[#15803D]">
                          Wind Speed
                        </div>
                        <div className="text-base font-bold text-slate-900 mt-1">
                          {selectedForecast.currentPoint.windMs ?? "—"} m/s
                        </div>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                        <div className="text-[11px] font-semibold text-[#15803D]">
                          Pressure
                        </div>
                        <div className="text-base font-bold text-slate-900 mt-1">
                          {selectedForecast.currentPoint.pressureHpa ?? "—"} hPa
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Source Contribution Percentages (Technical Role Only; Authorities see ONLY Final Blended Forecast) */}
                  {isTechnicalRole && (
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold text-[#14532D] mb-2">
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
                        <div className="p-3 rounded-xl bg-[#ECFDF5] border border-emerald-200 text-center">
                          <div className="text-[11px] font-semibold text-[#14532D]">
                            Ensemble
                          </div>
                          <div className="text-base font-bold text-[#14532D] mt-0.5">
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
                  </div>

                  {selectedForecast.activeGuidanceNote && (
                    <div className="p-3.5 rounded-xl bg-[#ECFDF5] border border-emerald-200 text-slate-800 text-xs">
                      <div className="font-bold text-[#14532D] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Active Control Room Guidance</span>
                      </div>
                      <p className="mt-1 font-medium">
                        “{selectedForecast.activeGuidanceNote}”
                      </p>
                    </div>
                  )}

                  {/* State Authorities -> District Authority Automated Report & Offline SMS Dispatch */}
                  {!isTechnicalRole && (
                    <div className="p-4 rounded-xl bg-[#F4F9F6] border border-emerald-200 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#14532D] flex items-center gap-1.5">
                          <Send className="w-3.5 h-3.5" />
                          <span>District Authority Auto-Dispatch</span>
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">
                          SMS Failover Ready
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-[#14532D] shrink-0" />
                        <input
                          type="tel"
                          value={prototypeMobile}
                          onChange={(e) => {
                            setPrototypeMobile(e.target.value);
                          }}
                          onBlur={() => {
                            const check = validateMobileNumber(prototypeMobile);
                            if (check.valid) {
                              setPrototypeMobile(check.formatted);
                              setStoredPrototypeMobile(check.formatted);
                              registerPrototypeMobileApi({
                                receiver_mobile: check.formatted,
                                district: selectedForecast.district.name,
                                email:
                                  session?.email ||
                                  "state-authority@kerala.gov.in",
                                role: "authority",
                                token: session?.idToken,
                              });
                            }
                          }}
                          placeholder="Enter 10-digit receiver mobile"
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-white border border-emerald-100 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#14532D]"
                        />
                      </div>

                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          disabled={dispatchingReport}
                          onClick={async () => {
                            const check = validateMobileNumber(prototypeMobile);
                            if (!check.valid) {
                              showToast(
                                check.error ||
                                  "Please enter a real 10-digit District Receiver Mobile Number before dispatching."
                              );
                              return;
                            }
                            setPrototypeMobile(check.formatted);
                            setStoredPrototypeMobile(check.formatted);
                            setDispatchingReport(true);
                            try {
                              await registerPrototypeMobileApi({
                                receiver_mobile: check.formatted,
                                district: selectedForecast.district.name,
                                email:
                                  session?.email ||
                                  "state-authority@kerala.gov.in",
                                role: "authority",
                                token: session?.idToken,
                              });
                              const res = await dispatchFinalDistrictReportApi({
                                district: selectedForecast.district.name,
                                lead_h: leadTime,
                                issued_by:
                                  session?.email ||
                                  "State Disaster Management Authority (KSDMA)",
                                role: "authority",
                                token: session?.idToken,
                              });
                              const smsText =
                                res?.sms_body ||
                                `[FOREXA ${selectedForecast.severity} ALERT] ${selectedForecast.district.name.toUpperCase()}: ${selectedForecast.eventType} (${selectedForecast.rain6hMm ?? "—"}mm/6h, Wind ${selectedForecast.currentPoint.windMs ?? "—"}m/s) onset +${leadTime}h. Official report dispatched — activate district emergency protocol.`;
                              // When online: sends BOTH full official report to that District Authority Dashboard AND SMS!
                              // When offline: sends SMS via cellular SIM!
                              triggerNativeOfflineSms(check.formatted, smsText);
                              showToast(
                                browserOnline
                                  ? `Final Official Report sent to ${selectedForecast.district.name} District Authority Dashboard & SMS triggered to ${check.formatted}!`
                                  : `Offline Mode · Emergency SMS triggered to ${check.formatted} for ${selectedForecast.district.name}!`
                              );
                            } finally {
                              setDispatchingReport(false);
                            }
                          }}
                          className="w-full py-2.5 px-3 rounded-xl bg-[#14532D] hover:bg-[#052E16] disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>
                            {dispatchingReport
                              ? "Dispatching Report..."
                              : `Send Final Report to ${selectedForecast.district.name} Authority`}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const smsBody = `[FOREXA ${selectedForecast.severity} ALERT] ${selectedForecast.district.name.toUpperCase()}: ${selectedForecast.eventType} (${selectedForecast.rain6hMm ?? "—"}mm/6h, Wind ${selectedForecast.currentPoint.windMs ?? "—"}m/s) onset +${leadTime}h. Activate district emergency protocol.`;
                            const res = triggerNativeOfflineSms(
                              prototypeMobile,
                              smsBody
                            );
                            if (!res.launched) {
                              showToast(
                                res.error ||
                                  "Please enter a valid 10-digit receiver mobile number first."
                              );
                            } else {
                              showToast(
                                `Opening native SIM SMS to ${res.target} (works offline via cellular network).`
                              );
                            }
                          }}
                          className="w-full py-2 px-3 rounded-xl bg-white hover:bg-[#ECFDF5] text-[#14532D] border border-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Send Offline SIM SMS</span>
                        </button>
                        <p className="text-[11px] text-slate-500 text-center leading-snug pt-0.5">
                          Open this link on your mobile device and install the
                          FOREXA app to dispatch offline cellular SMS alerts
                          directly.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={scrollToAnalogs}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#14532D] hover:underline"
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
                      className="px-4 py-2 rounded-xl bg-[#ECFDF5] hover:bg-[#14532D] text-[#14532D] hover:text-white text-xs font-semibold transition"
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
            liveStreamEnabled={liveStreamEnabled}
            liveCountdownSec={liveCountdownSec}
            liveTickCount={liveTickCount}
            liveStreamSnapshot={liveStreamSnapshot}
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

        {/* ================================================================
         * 7. TAB 5: FOREXA TIMELOOP (CONTINUOUS LEARNING SIMULATOR)
         * ================================================================ */}
        {activeTab === "timeloop" && isTechnicalRole && (
          <TimeLoopTab session={session} />
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
