import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./hooks/useTheme";
import "./styles/globals.css";
import "./styles/components.css";
import { apiBase } from "./api";

// Pre-warm the API base URL (reads from Electron IPC in packaged app)
void apiBase();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
