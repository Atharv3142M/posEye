import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Logs from "./pages/Logs";
import NewProject from "./pages/NewProject";
import Processing from "./pages/Processing";
import ProjectsList from "./pages/ProjectsList";
import Settings from "./pages/Settings";
import Viewer from "./pages/Viewer";

export default function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        {/* Sidebar is always shown except on the Viewer page which manages its own layout */}
        <Routes>
          <Route path="/viewer/:id" element={<Viewer />} />
          <Route
            path="*"
            element={
              <>
                <Sidebar />
                <div className="app-main">
                  <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/projects" element={<ProjectsList />} />
                    <Route path="/projects/new" element={<NewProject />} />
                    <Route path="/processing/:id" element={<Processing />} />
                    <Route path="/logs/:id?" element={<Logs />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </div>
              </>
            }
          />
        </Routes>
      </div>
    </HashRouter>
  );
}
