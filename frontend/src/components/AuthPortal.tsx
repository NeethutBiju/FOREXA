import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield,
  Users,
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  HelpCircle,
  ArrowRight,
  Radio,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Phone,
} from "lucide-react";
import {
  AccessRole,
  signInWithEmail,
  registerWithEmail,
  authenticateWithGoogle,
  resetUserPassword,
  UserSession,
  KERALA_14_DISTRICTS,
  getStoredAssignedDistrict,
  getStoredPrototypeMobile,
  validateMobileNumber,
} from "../firebase";
import { InstallAppButton } from "./InstallAppButton";

interface AuthPortalProps {
  onAuthenticated: (session: UserSession) => void;
}

function formatFirebaseError(err: any): string {
  const code = err?.code || "";
  const msg = err?.message || "";
  if (code === "auth/operation-not-allowed") {
    return "Email/Password sign-in is not enabled in Firebase Console. Go to Firebase Console -> Authentication -> Sign-in method -> Enable 'Email/Password'.";
  }
  if (code === "auth/email-already-in-use") {
    return "This email is already registered. Please switch to 'Sign In' or use 'Forgot password?'.";
  }
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Invalid email or password. If you haven't created an account yet, please click the 'Register' tab first.";
  }
  if (code === "auth/weak-password") {
    return "Password is too weak. Please use at least 8 characters.";
  }
  if (code === "auth/popup-closed-by-user") {
    return "Google sign-in popup was closed before completing.";
  }
  if (code === "auth/unauthorized-domain") {
    return "This domain (localhost) is not authorized in Firebase. In Firebase Console -> Authentication -> Settings -> Authorized domains, add 'localhost'.";
  }
  return msg || "Authentication error. Please check your credentials.";
}

export const AuthPortal: React.FC<AuthPortalProps> = ({ onAuthenticated }) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [role, setRole] = useState<AccessRole>("authority");
  const [assignedDistrict, setAssignedDistrict] = useState<string>(() =>
    getStoredAssignedDistrict()
  );
  const [receiverMobile, setReceiverMobile] = useState<string>(() =>
    getStoredPrototypeMobile()
  );
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const routeAfterLogin = (session: UserSession) => {
    onAuthenticated(session);
    if (session.role === "technical") {
      navigate("/technical");
    } else if (session.role === "district_authority") {
      navigate("/district-authority");
    } else {
      navigate("/authorities");
    }
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    if (!email.trim() || !password) {
      setErrorMsg("Please enter your institutional email and password.");
      return;
    }
    setLoading(true);
    try {
      const session = await signInWithEmail(
        email.trim(),
        password,
        role,
        rememberMe,
        assignedDistrict,
        receiverMobile
      );
      setStatusMsg("Authentication verified & logged to Cloud Firestore.");
      routeAfterLogin(session);
    } catch (err: any) {
      setErrorMsg(formatFirebaseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    if (!email.trim()) {
      setErrorMsg("Please enter your official email address.");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }
    if (role === "authority" || role === "district_authority") {
      const mobileCheck = validateMobileNumber(receiverMobile);
      if (!mobileCheck.valid) {
        setErrorMsg(
          mobileCheck.error ||
            "Please enter a valid 10-digit District Receiver Mobile Number."
        );
        return;
      }
    }
    setLoading(true);
    try {
      const validatedMobile =
        role === "authority" || role === "district_authority"
          ? validateMobileNumber(receiverMobile).formatted
          : "";
      const regionLabel =
        role === "district_authority"
          ? `Kerala (${assignedDistrict} District Authority)`
          : "Kerala (State-Wide Authority)";
      const session = await registerWithEmail(
        email.trim(),
        password,
        role,
        regionLabel,
        assignedDistrict,
        validatedMobile
      );
      setStatusMsg("Account created & audit record stored in Cloud Firestore.");
      routeAfterLogin(session);
    } catch (err: any) {
      setErrorMsg(formatFirebaseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    if (
      mode === "register" &&
      (role === "authority" || role === "district_authority")
    ) {
      const mobileCheck = validateMobileNumber(receiverMobile);
      if (!mobileCheck.valid) {
        setErrorMsg(
          mobileCheck.error ||
            "Please enter a valid 10-digit District Receiver Mobile Number before registering."
        );
        return;
      }
    }
    setLoading(true);
    try {
      const mobileCheck = validateMobileNumber(receiverMobile);
      const regionLabel =
        role === "district_authority"
          ? `Kerala (${assignedDistrict} District Authority)`
          : "Kerala (State-Wide Authority)";
      const session = await authenticateWithGoogle(
        role,
        regionLabel,
        assignedDistrict,
        mobileCheck.valid ? mobileCheck.formatted : ""
      );
      routeAfterLogin(session);
    } catch (err: any) {
      setErrorMsg(formatFirebaseError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    if (!email.trim()) {
      setErrorMsg("Enter your institutional email address above to receive a password reset link.");
      return;
    }
    try {
      await resetUserPassword(email.trim());
      setStatusMsg(`Password reset email sent to ${email.trim()}.`);
    } catch (err: any) {
      setErrorMsg(formatFirebaseError(err));
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F4F9F6] text-slate-800">
      {/* Top Navbar matching Screenshot 1 & 2 */}
      <header className="w-full bg-white border-b border-slate-100 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-[#14532D] flex items-center justify-center shadow-sm">
            <div className="w-4 h-4 rounded-full border-2 border-white flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
            </div>
          </div>
          <span className="font-extrabold text-sm tracking-wide text-slate-900">
            FOREXA
          </span>
          <span className="text-slate-200">|</span>
          <span className="text-xs text-slate-500 font-semibold hidden sm:inline">
            Adaptive &amp; Explainable Forecast System
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <InstallAppButton />
          <button
            type="button"
            onClick={() =>
              setStatusMsg(
                "FOREXA SIH26081 Helpdesk: Connected to Firebase Project forexa-e5dc7 & FastAPI Adaptive Engine."
              )
            }
            className="flex items-center space-x-1 text-xs font-medium text-slate-500 hover:text-slate-800 transition"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Support</span>
          </button>

          <div className="flex items-center space-x-1.5 bg-[#ECFDF5] text-[#14532D] px-3 py-1 rounded-full text-[11px] font-bold tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-[#14532D] animate-pulse" />
            <span>SYSTEM ONLINE</span>
          </div>
        </div>
      </header>

      {/* Center Authentication Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[440px] bg-white rounded-2xl shadow-[0_12px_40px_rgba(109,40,217,0.08)] border border-slate-100 overflow-hidden">
          {/* Top Royal Purple Accent Bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-[#14532D] via-[#15803D] to-[#14532D]" />

          <div className="p-8">
            {/* Pill Badge */}
            <div className="flex justify-center mb-3">
              <div className="inline-flex items-center space-x-1.5 bg-[#ECFDF5] text-[#14532D] px-3 py-1 rounded-full text-[11px] font-semibold">
                <Radio className="w-3 h-3" />
                <span>Adaptive &amp; Explainable Forecast System</span>
              </div>
            </div>

            {/* Dynamic Heading & Subtitle */}
            {mode === "signin" ? (
              <div className="text-center mb-6">
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Sign in to FOREXA
                </h1>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed max-w-xs mx-auto">
                  Enter your official credentials to access the forecasting and
                  real-time telemetry portal.
                </p>
              </div>
            ) : (
              <div className="text-center mb-6">
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Create FOREXA Account
                </h1>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed max-w-xs mx-auto">
                  Register your official credentials with state and district
                  authority access.
                </p>
              </div>
            )}

            {/* Mode Switcher: Sign In vs Register */}
            <div className="grid grid-cols-2 bg-[#F4F9F6] p-1 rounded-xl mb-5 border border-emerald-100/60">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setErrorMsg(null);
                  setStatusMsg(null);
                }}
                className={`flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-bold transition ${
                  mode === "signin"
                    ? "bg-white text-[#14532D] shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setErrorMsg(null);
                  setStatusMsg(null);
                }}
                className={`flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-bold transition ${
                  mode === "register"
                    ? "bg-white text-[#14532D] shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Register</span>
              </button>
            </div>

            {/* Role Switcher: 3 Roles (State Authorities, District Authorities, Technical Person) */}
            <div className="mb-4">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                {mode === "signin"
                  ? "SELECT ACCESS ROLE (3 DASHBOARDS)"
                  : "SELECT DESIGNATED ROLE"}
              </label>
              <div className="grid grid-cols-3 bg-[#F4F9F6] p-1 rounded-xl border border-emerald-100/60 gap-1">
                <button
                  type="button"
                  onClick={() => setRole("authority")}
                  className={`flex items-center justify-center space-x-1 py-2 px-1.5 rounded-lg text-[11px] font-bold transition ${
                    role === "authority"
                      ? "bg-white text-[#14532D] shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Shield className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Authorities</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRole("district_authority")}
                  className={`flex items-center justify-center space-x-1 py-2 px-1.5 rounded-lg text-[11px] font-bold transition ${
                    role === "district_authority"
                      ? "bg-white text-[#14532D] shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">District Auth</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRole("technical")}
                  className={`flex items-center justify-center space-x-1 py-2 px-1.5 rounded-lg text-[11px] font-bold transition ${
                    role === "technical"
                      ? "bg-white text-[#14532D] shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Technical</span>
                </button>
              </div>
            </div>

            {/* Alert Messages */}
            {errorMsg && (
              <div className="mb-4 flex items-start space-x-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-xl text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
            {statusMsg && (
              <div className="mb-4 flex items-start space-x-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2.5 rounded-xl text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{statusMsg}</span>
              </div>
            )}

            {/* SIGN IN FORM */}
            {mode === "signin" ? (
              <form onSubmit={handleSignInSubmit} className="space-y-4">
                {role === "district_authority" && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#14532D]">
                        DISTRICT AUTHORITY JURISDICTION
                      </label>
                      <span className="text-[10px] text-slate-400">
                        Auto-routes priority alerts
                      </span>
                    </div>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-[#14532D] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <select
                        value={assignedDistrict}
                        onChange={(e) => setAssignedDistrict(e.target.value)}
                        className="w-full pl-10 pr-3.5 py-2.5 bg-[#F4F9F6] border border-emerald-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#14532D] focus:bg-white transition"
                      >
                        {KERALA_14_DISTRICTS.map((d) => (
                          <option key={d} value={d}>
                            {d} District Authority
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      INSTITUTIONAL OR WORK EMAIL
                    </label>
                    <span className="text-[10px] text-slate-400">
                      e.g., analyst@forexa.org
                    </span>
                  </div>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="officer@domain.org"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-[#F4F9F6] border border-emerald-100 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#14532D] focus:bg-white transition"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      PASSWORD
                    </label>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-[11px] font-bold text-[#14532D] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full pl-10 pr-10 py-2.5 bg-[#F4F9F6] border border-emerald-100 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#14532D] focus:bg-white transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-[#14532D] focus:ring-[#14532D]"
                    />
                    <span className="text-xs text-slate-600 font-medium">
                      Remember me
                    </span>
                  </label>
                  <div className="inline-flex items-center space-x-1 bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>2FA ACTIVE</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#14532D] hover:bg-[#166534] disabled:opacity-60 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-500/20 flex items-center justify-center space-x-2 transition"
                >
                  <span>{loading ? "Signing In..." : "Sign In"}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              /* REGISTER FORM with District Selection (for District Authorities) & Prototype Receiver Mobile Number */
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                {role === "district_authority" && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#14532D]">
                        ASSIGNED KERALA DISTRICT
                      </label>
                      <span className="text-[10px] text-slate-400">
                        Receives automated district alerts
                      </span>
                    </div>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-[#14532D] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <select
                        value={assignedDistrict}
                        onChange={(e) => setAssignedDistrict(e.target.value)}
                        className="w-full pl-10 pr-3.5 py-2.5 bg-[#F4F9F6] border border-emerald-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#14532D] focus:bg-white transition"
                      >
                        {KERALA_14_DISTRICTS.map((d) => (
                          <option key={d} value={d}>
                            {d} District
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                      OFFICIAL EMAIL ADDRESS
                    </label>
                    <span className="text-[10px] text-slate-400">
                      Official domain required
                    </span>
                  </div>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="officer@department.gov"
                      className="w-full pl-10 pr-3.5 py-2.5 bg-[#F4F9F6] border border-emerald-100 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#14532D] focus:bg-white transition"
                    />
                  </div>
                </div>

                {(role === "authority" || role === "district_authority") && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#14532D]">
                        DISTRICT RECEIVER MOBILE NUMBER
                      </label>
                      <span className="text-[10px] text-slate-400">
                        Used for emergency offline SMS alerts
                      </span>
                    </div>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-[#14532D] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        required
                        value={receiverMobile}
                        onChange={(e) => setReceiverMobile(e.target.value)}
                        placeholder="Enter 10-digit mobile (e.g., +91 9447XXXXXX)"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-[#F4F9F6] border border-emerald-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#14532D] focus:bg-white transition"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Used by Google Cloud Functions + AI Emergency SMS/Voice
                      Failover whenever any district recipient is offline or
                      unacknowledged.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                      SET PASSWORD
                    </label>
                    <div className="relative">
                      <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 8 chars"
                        className="w-full pl-8 pr-8 py-2.5 bg-[#F4F9F6] border border-emerald-100 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#14532D] focus:bg-white transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                      CONFIRM PASSWORD
                    </label>
                    <div className="relative">
                      <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        required
                        minLength={8}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter"
                        className="w-full pl-8 pr-8 py-2.5 bg-[#F4F9F6] border border-emerald-100 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#14532D] focus:bg-white transition"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-[#14532D] hover:bg-[#166534] disabled:opacity-60 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-500/20 flex items-center justify-center space-x-2 transition"
                >
                  <span>{loading ? "Registering..." : "Register Account"}</span>
                  <UserPlus className="w-4 h-4" />
                </button>
              </form>
            )}

            {/* Divider */}
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {mode === "signin" ? "OR CONTINUE WITH" : "OR REGISTER WITH"}
                </span>
              </div>
            </div>

            {/* Google OAuth Button */}
            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={loading}
              className="w-full py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center space-x-2.5 transition shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.74-.06-1.47-.19-2.18H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.06Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              <span>
                {mode === "signin" ? "Sign in with Google" : "Sign up with Google"}
              </span>
            </button>

            {/* Switch Link */}
            <p className="text-center text-xs text-slate-500 mt-5">
              {mode === "signin" ? (
                <>
                  Don&apos;t have an official account?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("register")}
                    className="font-bold text-[#14532D] hover:underline"
                  >
                    Register
                  </button>
                </>
              ) : (
                <>
                  Already have an official account?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signin")}
                    className="font-bold text-[#14532D] hover:underline"
                  >
                    Sign In
                  </button>
                </>
              )}
            </p>

            {/* Card Footer Security Badges */}
            <div className="mt-6 pt-4 border-t border-slate-100 text-center space-y-1.5">
              <div className="flex items-center justify-center space-x-1.5 text-[10px] font-bold text-slate-500">
                <Lock className="w-3 h-3 text-[#14532D]" />
                <span>Protected by TLS 1.3 256-bit encryption</span>
                <span>•</span>
                <span>Role-verified access</span>
              </div>
              <div className="flex items-center justify-center space-x-2 text-[10px] text-slate-400">
                <span>Access Policy</span>
                <span>•</span>
                <span>Emergency Protocol</span>
                <span>•</span>
                <span>System Helpdesk</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Footer Bar */}
      <footer className="w-full px-6 py-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 bg-white">
        <span className="font-semibold text-slate-500">
          FOREXA | Adaptive &amp; Explainable Forecast System
        </span>
        <span className="flex items-center space-x-1">
          <Shield className="w-3.5 h-3.5 text-slate-400" />
          <span>Secure Role-Based Access</span>
        </span>
      </footer>
    </div>
  );
};
