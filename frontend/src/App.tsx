import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthPortal } from "./components/AuthPortal";
import { ForecastIntelligenceDashboard } from "./components/ForecastIntelligenceDashboard";
import { DistrictAuthorityDashboard } from "./components/DistrictAuthorityDashboard";
import { getStoredSession, UserSession } from "./firebase";

export const App: React.FC = () => {
  const [session, setSession] = useState<UserSession | null>(() =>
    getStoredSession()
  );

  const getHomeRouteForSession = (s: UserSession) => {
    if (s.role === "technical") return "/technical";
    if (s.role === "district_authority") return "/district-authority";
    return "/authorities";
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            session ? (
              <Navigate to={getHomeRouteForSession(session)} replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/login"
          element={<AuthPortal onAuthenticated={setSession} />}
        />
        <Route
          path="/authorities"
          element={
            session ? (
              session.role === "authority" ? (
                <ForecastIntelligenceDashboard
                  session={session}
                  forcedRole="authority"
                  onLogout={() => setSession(null)}
                />
              ) : (
                <Navigate to={getHomeRouteForSession(session)} replace />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/district-authority"
          element={
            session ? (
              session.role === "district_authority" ? (
                <DistrictAuthorityDashboard
                  session={session}
                  onLogout={() => setSession(null)}
                />
              ) : (
                <Navigate to={getHomeRouteForSession(session)} replace />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/technical"
          element={
            session ? (
              session.role === "technical" ? (
                <ForecastIntelligenceDashboard
                  session={session}
                  forcedRole="technical"
                  onLogout={() => setSession(null)}
                />
              ) : (
                <Navigate to={getHomeRouteForSession(session)} replace />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="*"
          element={
            <Navigate
              to={session ? getHomeRouteForSession(session) : "/login"}
              replace
            />
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
