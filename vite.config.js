// The self-updater compares its own version against the latest release
// (docs/adr/0007), and the release pipeline's version source of truth is
// src-tauri/tauri.conf.json (docs/adr/0006) — so inline that, not a copy.
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const { version } = JSON.parse(
  readFileSync("./src-tauri/tauri.conf.json", "utf8"),
);

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
});
