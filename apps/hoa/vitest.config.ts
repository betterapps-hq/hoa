import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "cloudflare:workers": fileURLToPath(new URL("src/tests/cloudflareWorkers.ts", import.meta.url))
    }
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/tests/setup.ts"],
    // Component tests type into tables of the whole sample rulebook (over a thousand terms) a key at a time: two to
    // three seconds alone, past Vitest's five-second default when every worker runs under coverage at once.
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html", "lcov", "json-summary"],
      reportsDirectory: "coverage",
      include: ["src/**/*.{ts,tsx}"],
      // Routes, server functions and *.server.ts wiring hold no logic of their own; they're covered by browser acceptance.
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.stories.tsx",
        "src/**/*.server.ts",
        "src/features/**/run*.ts",
        "src/**/*.functions.ts",
        "src/server.ts",
        "src/workflows/**",
        "src/routeTree.gen.ts",
        "src/components/ui/**",
        "src/hooks/use-mobile.ts",
        "src/lib/utils.ts",
        "src/router.tsx",
        "src/routes/**",
        "src/tests/**"
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        branches: 75,
        functions: 80
      }
    }
  }
})
