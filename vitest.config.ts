import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Next.js guards server modules with this import; it is meaningless under Vitest.
      "server-only": path.resolve(__dirname, "test/empty.ts"),
    },
  },
  // Loads .env so the database integration tests can run; they skip without DATABASE_URL.
  test: { environment: "node", fileParallelism: false, env: loadEnv("test", process.cwd(), "") },
});
