import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

// overview, раздел 2: непредвиденные ошибки вне React-рендера (обработчики
// событий, оторванные промисы) не должны молча теряться - логируем их так же,
// как ошибки внутри рендера ловит ErrorBoundary.
window.addEventListener("error", (e) => {
  console.error("Unhandled error:", e.error || e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled promise rejection:", e.reason);
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
