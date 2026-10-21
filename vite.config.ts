import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { allowedHosts: ["terminal.local"] },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    maxWorkers: 2,
    setupFiles: ["tests/setup.ts"],
    restoreMocks: true,
  },
  build: { outDir: "dist" },
});
