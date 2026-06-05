import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const legacyScriptFiles = [
  "scripts/**/*.{ts,js,mjs,cjs}",
  "execution/**/*.{ts,js,mjs,cjs}",
  "print-agent/**/*.{ts,js,mjs,cjs}",
  "prisma/**/*.{ts,js,mjs,cjs}",
  "debug_*.ts",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Debug/legacy JS scripts (CommonJS, not part of the app)
    "debug_*.js",
    "update_view_v2.js",
  ]),
  {
    files: legacyScriptFiles,
    rules: {
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
