// Fonts self-hosted via @fontsource — offline-first, and the CSP allows no
// remote origins (see docs/adr/0001-tauri-2-not-pwa.md).
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./styles.css";

import { start } from "./router.js";
import { render } from "./screens.js";

// Adds queue on this device at the door and wait for the drain screen
// (ADR 0005), so there is nothing to do at boot — the queue keeps them
// until the coordinator finishes them in Google Groups' own UI.
start(render);
