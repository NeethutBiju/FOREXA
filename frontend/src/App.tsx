import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthPortal } from "./components/AuthPortal";
import { ForecastIntelligenceDashboard } from "./components/ForecastIntelligenceDashboard";
import { getStoredSession, UserSession } from "./firebase";

export const App: React.FC = () => {
  const [session, setSession] = useState<UserSession | null>(() =>
    getStoredSession()
  );

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <ForecastIntelligenceDashboard
              session={session}
              onLogout={() => setSession(null)}
            />
          }
        />
        <Route
          path="/login"
          element={<AuthPortal onAuthenticated={setSession} />}
        />
        <Route
          path="/authorities"
          element={
            <ForecastIntelligenceDashboard
              session={session}
              forcedRole="authority"
              onLogout={() => setSession(null)}
            />
          }
        />
        <Route
          path="/technical"
          element={
            <ForecastIntelligenceDashboard
              session={session}
              forcedRole="technical"
              onLogout={() => setSession(null)}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
