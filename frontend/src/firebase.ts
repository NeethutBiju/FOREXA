import { initializeApp } from "firebase/app";
import { getAnalytics, logEvent, isSupported } from "firebase/analytics";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  signOut,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

export const firebaseConfig = {
  apiKey:
    import.meta.env.VITE_FIREBASE_API_KEY ||
    "AIzaSyBTPlg-fAjWObi4Qv9DRZXnu1W3MrdnMug",
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
    "forexa-e5dc7.firebaseapp.com",
  projectId:
    import.meta.env.VITE_FIREBASE_PROJECT_ID || "forexa-e5dc7",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
    "forexa-e5dc7.firebasestorage.app",
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "114318600336",
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    "1:114318600336:web:309a793d7d39d671ed5015",
  measurementId:
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-LXDM92KRZ6",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

let analyticsInstance: ReturnType<typeof getAnalytics> | null = null;
isSupported()
  .then((supported) => {
    if (supported) {
      analyticsInstance = getAnalytics(app);
    }
  })
  .catch(() => {});

export function trackAnalyticsEvent(
  eventName: string,
  params?: Record<string, any>
): void {
  try {
    if (analyticsInstance) {
      logEvent(analyticsInstance, eventName, params);
    }
    if (typeof window !== "undefined" && typeof (window as any).gtag === "function") {
      (window as any).gtag("event", eventName, params || {});
    }
  } catch {
    // non-blocking analytics
  }
}

export type AccessRole = "authority" | "district_authority" | "technical";

export const KERALA_14_DISTRICTS: string[] = [
  "Wayanad",
  "Idukki",
  "Kozhikode",
  "Ernakulam",
  "Thrissur",
  "Palakkad",
  "Malappuram",
  "Kannur",
  "Kasaragod",
  "Kottayam",
  "Alappuzha",
  "Pathanamthitta",
  "Kollam",
  "Thiruvananthapuram",
];

export interface UserSession {
  uid: string;
  email: string;
  role: AccessRole;
  stateRegion: string;
  assignedDistrict?: string;
  receiverMobile?: string;
  authProvider: string;
  idToken?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

const DUMMY_MOBILE_PATTERNS = new Set([
  "9876543210",
  "1234567890",
  "0123456789",
  "0000000000",
  "1111111111",
  "2222222222",
  "3333333333",
  "4444444444",
  "5555555555",
  "6666666666",
  "7777777777",
  "8888888888",
  "9999999999",
]);

export function validateMobileNumber(raw: string): {
  valid: boolean;
  formatted: string;
  error?: string;
} {
  const cleaned = raw.replace(/[\s\-()]/g, "");
  if (!cleaned) {
    return {
      valid: false,
      formatted: "",
      error: "Please enter a valid 10-digit mobile number (e.g., +91 9447XXXXXX).",
    };
  }
  const match = cleaned.match(/^(?:\+?91)?([6-9]\d{9})$/);
  if (!match) {
    return {
      valid: false,
      formatted: "",
      error:
        "Invalid mobile number. Enter a real 10-digit Indian mobile number starting with 6, 7, 8, or 9 (e.g., +91 9447XXXXXX).",
    };
  }
  const digits10 = match[1];
  if (DUMMY_MOBILE_PATTERNS.has(digits10) || /^(\d)\1{9}$/.test(digits10)) {
    return {
      valid: false,
      formatted: "",
      error:
        "Placeholder or repeated phone numbers are not allowed. Please enter a real receiver mobile number.",
    };
  }
  return {
    valid: true,
    formatted: `+91 ${digits10}`,
  };
}

export function getStoredPrototypeMobile(): string {
  const stored = localStorage.getItem("forexa_prototype_receiver_mobile") || "";
  if (!stored) return "";
  const check = validateMobileNumber(stored);
  return check.valid ? check.formatted : "";
}

export function setStoredPrototypeMobile(mobile: string): void {
  const check = validateMobileNumber(mobile);
  if (check.valid) {
    localStorage.setItem("forexa_prototype_receiver_mobile", check.formatted);
  }
}

export function getStoredAssignedDistrict(): string {
  return localStorage.getItem("forexa_assigned_district") || "Wayanad";
}

export function setStoredAssignedDistrict(district: string): void {
  if (district && district.trim()) {
    localStorage.setItem("forexa_assigned_district", district.trim());
  }
}

async function syncAuditToBackend(payload: {
  uid: string;
  email: string;
  selected_role: AccessRole;
  action: "SIGN_IN" | "REGISTER" | "GOOGLE_OAUTH_SIGN_IN";
  status: string;
  state_region: string;
  assigned_district?: string;
  receiver_mobile?: string;
  auth_provider: string;
  firestore_synced: boolean;
}) {
  try {
    await fetch(`${API_BASE}/auth/session-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        user_agent: navigator.userAgent,
      }),
    });
  } catch (err) {
    console.warn("Backend session mirror non-blocking error:", err);
  }
}

export async function recordFirestoreAndBackendLogin(params: {
  uid: string;
  email: string;
  role: AccessRole;
  stateRegion: string;
  assignedDistrict?: string;
  receiverMobile?: string;
  action: "SIGN_IN" | "REGISTER" | "GOOGLE_OAUTH_SIGN_IN";
  authProvider: string;
  idToken?: string;
}): Promise<UserSession> {
  let firestoreSynced = false;
  let resolvedDistrict =
    params.assignedDistrict || getStoredAssignedDistrict() || "Wayanad";
  let resolvedMobile =
    params.receiverMobile || getStoredPrototypeMobile() || "";

  if (params.receiverMobile && params.receiverMobile.trim()) {
    setStoredPrototypeMobile(params.receiverMobile.trim());
    resolvedMobile = params.receiverMobile.trim();
  }
  if (params.assignedDistrict && params.assignedDistrict.trim()) {
    setStoredAssignedDistrict(params.assignedDistrict.trim());
    resolvedDistrict = params.assignedDistrict.trim();
  }

  try {
    const userRef = doc(db, "users", params.uid);
    const snap = await getDoc(userRef);
    const existingData = snap.exists() ? snap.data() : null;

    if (!params.assignedDistrict && existingData?.assigned_district) {
      resolvedDistrict = existingData.assigned_district;
      setStoredAssignedDistrict(resolvedDistrict);
    }
    if (!params.receiverMobile && existingData?.receiver_mobile) {
      resolvedMobile = existingData.receiver_mobile;
      setStoredPrototypeMobile(resolvedMobile);
    }

    await setDoc(
      userRef,
      {
        uid: params.uid,
        email: params.email,
        role: params.role,
        state_region:
          params.stateRegion || existingData?.state_region || "Kerala",
        assigned_district: resolvedDistrict,
        receiver_mobile: resolvedMobile,
        auth_provider: params.authProvider,
        created_at: existingData?.created_at || serverTimestamp(),
        last_login_at: serverTimestamp(),
      },
      { merge: true }
    );

    await addDoc(collection(db, "login_audit_logs"), {
      uid: params.uid,
      email: params.email,
      selected_role: params.role,
      action: params.action,
      status: "SUCCESS",
      state_region: params.stateRegion || "Kerala",
      assigned_district: resolvedDistrict,
      receiver_mobile: resolvedMobile,
      auth_provider: params.authProvider,
      user_agent: navigator.userAgent,
      timestamp: serverTimestamp(),
      timestamp_iso: new Date().toISOString(),
    });
    firestoreSynced = true;
  } catch (err) {
    console.warn(
      "Firestore write warning (continuing with backend audit log):",
      err
    );
  }

  await syncAuditToBackend({
    uid: params.uid,
    email: params.email,
    selected_role: params.role,
    action: params.action,
    status: "SUCCESS",
    state_region: params.stateRegion || "Kerala",
    assigned_district: resolvedDistrict,
    receiver_mobile: resolvedMobile,
    auth_provider: params.authProvider,
    firestore_synced: firestoreSynced,
  });

  const session: UserSession = {
    uid: params.uid,
    email: params.email,
    role: params.role,
    stateRegion: params.stateRegion || "Kerala",
    assignedDistrict: resolvedDistrict,
    receiverMobile: resolvedMobile,
    authProvider: params.authProvider,
    idToken: params.idToken,
  };
  localStorage.setItem("forexa_session", JSON.stringify(session));
  return session;
}

export async function signInWithEmail(
  email: string,
  password: string,
  role: AccessRole,
  rememberMe: boolean,
  assignedDistrict?: string,
  receiverMobile?: string
): Promise<UserSession> {
  await setPersistence(
    auth,
    rememberMe ? browserLocalPersistence : browserSessionPersistence
  );
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const token = await cred.user.getIdToken();
  return recordFirestoreAndBackendLogin({
    uid: cred.user.uid,
    email: cred.user.email || email,
    role,
    stateRegion: "Kerala",
    assignedDistrict,
    receiverMobile,
    action: "SIGN_IN",
    authProvider: "password",
    idToken: token,
  });
}

export async function registerWithEmail(
  email: string,
  password: string,
  role: AccessRole,
  stateRegion: string,
  assignedDistrict?: string,
  receiverMobile?: string
): Promise<UserSession> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const token = await cred.user.getIdToken();
  return recordFirestoreAndBackendLogin({
    uid: cred.user.uid,
    email: cred.user.email || email,
    role,
    stateRegion,
    assignedDistrict,
    receiverMobile,
    action: "REGISTER",
    authProvider: "password",
    idToken: token,
  });
}

export async function authenticateWithGoogle(
  role: AccessRole,
  stateRegion: string = "Kerala",
  assignedDistrict?: string,
  receiverMobile?: string
): Promise<UserSession> {
  const cred = await signInWithPopup(auth, googleProvider);
  const token = await cred.user.getIdToken();
  return recordFirestoreAndBackendLogin({
    uid: cred.user.uid,
    email: cred.user.email || "",
    role,
    stateRegion,
    assignedDistrict,
    receiverMobile,
    action: "GOOGLE_OAUTH_SIGN_IN",
    authProvider: "google.com",
    idToken: token,
  });
}

export async function resetUserPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export async function logoutUser() {
  try {
    await signOut(auth);
  } finally {
    localStorage.removeItem("forexa_session");
  }
}

export async function sendSystemAlertNotification(
  title: string,
  body: string
): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  try {
    let perm = Notification.permission;
    if (perm === "default") {
      perm = await Notification.requestPermission();
    }
    if (perm !== "granted") return false;

    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(title, {
          body,
          tag: "forexa-emergency-alert",
          requireInteraction: true,
        });
        return true;
      }
    }
    new Notification(title, { body });
    return true;
  } catch {
    return false;
  }
}

export async function saveDistrictDispatchToFirestore(
  district: string,
  payload: Record<string, any>
): Promise<boolean> {
  try {
    const ref = doc(db, "district_dispatches", district.toLowerCase());
    await setDoc(
      ref,
      {
        ...payload,
        district,
        has_official_dispatch: true,
        updated_at_iso: new Date().toISOString(),
        updated_at: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch {
    return false;
  }
}

export async function loadDistrictDispatchFromFirestore(
  district: string
): Promise<Record<string, any> | null> {
  try {
    const ref = doc(db, "district_dispatches", district.toLowerCase());
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as Record<string, any>;
    }
    return null;
  } catch {
    return null;
  }
}

export function triggerNativeOfflineSms(
  mobile: string,
  message: string
): { launched: boolean; error?: string; target?: string } {
  const check = validateMobileNumber(mobile);
  if (!check.valid) {
    return {
      launched: false,
      error:
        check.error ||
        "Please enter and save a valid 10-digit registered mobile number first.",
    };
  }
  const phoneDigits = check.formatted.replace(/\s+/g, "");
  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/i.test(navigator.userAgent);
  const sep = isIOS ? "&" : "?";
  const smsUrl = `sms:${phoneDigits}${sep}body=${encodeURIComponent(message)}`;
  const a = document.createElement("a");
  a.href = smsUrl;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return { launched: true, target: check.formatted };
}

export function getUserInitials(email?: string): string {
  if (!email) return "FX";
  const handle = email.split("@")[0].replace(/[^a-zA-Z]/g, "");
  if (!handle) return "FX";
  if (handle.length === 1) return (handle + handle).toUpperCase();
  return (handle[0] + handle[handle.length - 1]).toUpperCase();
}

export function getStoredSession(): UserSession | null {
  const raw = localStorage.getItem("forexa_session");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserSession;
  } catch {
    return null;
  }
}
