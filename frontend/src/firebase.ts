import { initializeApp } from "firebase/app";
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
  apiKey: "AIzaSyBTPlg-fAjWObi4Qv9DRZXnu1W3MrdnMug",
  authDomain: "forexa-e5dc7.firebaseapp.com",
  projectId: "forexa-e5dc7",
  storageBucket: "forexa-e5dc7.firebasestorage.app",
  messagingSenderId: "114318600336",
  appId: "1:114318600336:web:309a793d7d39d671ed5015",
  measurementId: "G-LXDM92KRZ6",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export type AccessRole = "authority" | "technical";

export interface UserSession {
  uid: string;
  email: string;
  role: AccessRole;
  stateRegion: string;
  authProvider: string;
  idToken?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

async function syncAuditToBackend(payload: {
  uid: string;
  email: string;
  selected_role: AccessRole;
  action: "SIGN_IN" | "REGISTER" | "GOOGLE_OAUTH_SIGN_IN";
  status: string;
  state_region: string;
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
  action: "SIGN_IN" | "REGISTER" | "GOOGLE_OAUTH_SIGN_IN";
  authProvider: string;
  idToken?: string;
}): Promise<UserSession> {
  let firestoreSynced = false;
  try {
    const userRef = doc(db, "users", params.uid);
    const snap = await getDoc(userRef);
    const existingData = snap.exists() ? snap.data() : null;

    await setDoc(
      userRef,
      {
        uid: params.uid,
        email: params.email,
        role: params.role,
        state_region: params.stateRegion || existingData?.state_region || "Kerala",
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
      auth_provider: params.authProvider,
      user_agent: navigator.userAgent,
      timestamp: serverTimestamp(),
      timestamp_iso: new Date().toISOString(),
    });
    firestoreSynced = true;
  } catch (err) {
    console.warn("Firestore write warning (continuing with backend audit log):", err);
  }

  await syncAuditToBackend({
    uid: params.uid,
    email: params.email,
    selected_role: params.role,
    action: params.action,
    status: "SUCCESS",
    state_region: params.stateRegion || "Kerala",
    auth_provider: params.authProvider,
    firestore_synced: firestoreSynced,
  });

  const session: UserSession = {
    uid: params.uid,
    email: params.email,
    role: params.role,
    stateRegion: params.stateRegion || "Kerala",
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
  rememberMe: boolean
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
    action: "SIGN_IN",
    authProvider: "password",
    idToken: token,
  });
}

export async function registerWithEmail(
  email: string,
  password: string,
  role: AccessRole,
  stateRegion: string
): Promise<UserSession> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const token = await cred.user.getIdToken();
  return recordFirestoreAndBackendLogin({
    uid: cred.user.uid,
    email: cred.user.email || email,
    role,
    stateRegion,
    action: "REGISTER",
    authProvider: "password",
    idToken: token,
  });
}

export async function authenticateWithGoogle(
  role: AccessRole,
  stateRegion: string = "Kerala"
): Promise<UserSession> {
  const cred = await signInWithPopup(auth, googleProvider);
  const token = await cred.user.getIdToken();
  return recordFirestoreAndBackendLogin({
    uid: cred.user.uid,
    email: cred.user.email || "",
    role,
    stateRegion,
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

export function getStoredSession(): UserSession | null {
  const raw = localStorage.getItem("forexa_session");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserSession;
  } catch {
    return null;
  }
}
