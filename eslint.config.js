import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser, __APP_VERSION__: "readonly" },
    },
  },
  {
    files: ["test/**/*.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
