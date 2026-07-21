import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "tests/**/*.{test,spec}.{ts,tsx}",
      "src/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    // Integration tests talk to a REMOTE database (Supabase), so each query
    // carries real network latency. The 5s default is too tight once several
    // users/projects are created in one test.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run test FILES one at a time. Every integration file shares the same
    // database; running them in parallel causes connection contention and
    // flaky timeouts. Sequential is slower but deterministic.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
