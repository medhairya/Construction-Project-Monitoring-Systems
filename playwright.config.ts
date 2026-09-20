import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:" + PORT,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // The store is a single JSON file, so the E2E run needs its own server.
    command: "npm run dev -- --port " + PORT,
    url: "http://localhost:" + PORT + "/login",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
