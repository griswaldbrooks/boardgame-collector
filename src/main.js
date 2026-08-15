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

// Pending share intents are forwarded on submit (a handoff needs a
// coordinator gesture), so there is nothing to drain at boot — the queue
// just keeps them until the next add.
start(render);
