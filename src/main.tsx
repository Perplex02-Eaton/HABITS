import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./styles/global.css";
import { initStore } from "./stores/useStore";
import { initAccess } from "./stores/useAccess";

// Auto-login from shared link
const hash = window.location.hash;
const m = hash.match(/access_token=([^&]+)/);
if (m) {
  import("./lib/supabase").then(({ supabase }) => {
    if (supabase) {
      supabase.auth.setSession({ access_token: m[1], refresh_token: "" }).then(() => {
        window.location.hash = "/";
      });
    }
  });
}

initStore();
initAccess();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
