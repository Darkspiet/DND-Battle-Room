import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off"
    }
  },
  globalIgnores([
    ".next/**",
    "dist/**",
    "node_modules/**",
    "playwright-report/**",
    "test-results/**",
    "db/migrations/meta/**",
    "next-env.d.ts"
  ])
]);
