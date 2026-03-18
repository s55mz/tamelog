import { readFileSync } from "node:fs";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8")
) as { version: string };

const buildStamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const buildId = `${pkg.version}+${buildStamp}`;
const rootDir = fileURLToPath(new URL(".", import.meta.url));

function copyServiceWorkerPlugin(): Plugin {
  return {
    name: "copy-service-worker",
    closeBundle() {
      copyFileSync(
        resolve(rootDir, "public/sw.js"),
        resolve(rootDir, "dist/sw.js")
      );
    }
  };
}

export default defineConfig({
  plugins: [react(), copyServiceWorkerPlugin()],
  publicDir: "../img",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD_ID__: JSON.stringify(buildId),
    __APP_COPYRIGHT__: JSON.stringify(`© ${new Date().getFullYear()} TameLog`)
  },
  server: {
    port: 5173
  }
});
