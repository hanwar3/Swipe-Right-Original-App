// A meta CSP cannot set frame-ancestors, so refuse to be framed by another site:
// a hidden frame could otherwise trick a click on "Delete my account".
if (window.top && window.top !== window.self) {
  try {
    window.top.location.href = window.self.location.href;
  } catch {
    document.documentElement.innerHTML = '';
  }
}

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
