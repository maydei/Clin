import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", ".next/**", "build/**", "dist/**", "release/**"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 75,
      },
      include: [
        "src/lib/editor/model.ts",
        "src/lib/editor/history.ts",
        "src/lib/editor/geometry.ts",
        "src/lib/editor/export.ts",
        "src/lib/editor/project-file.ts",
      ],
      exclude: ["**/*.test.ts"],
    },
  },
});
