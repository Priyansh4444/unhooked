import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    /**
     * Shared scripts are executed via vm.runInContext in tests (like the browser),
     * so they are not instrumented — line coverage stays 0% for those files.
     * Use `npm run test:coverage` for an informational report only.
     */
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["shared/**/*.js", "content/**/*.js"],
      exclude: ["**/tests/**", "**/node_modules/**"]
    }
  }
});
