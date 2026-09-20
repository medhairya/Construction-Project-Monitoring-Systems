import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
      // `server-only` throws outside a React Server Component; stub it for tests.
      "server-only": path.resolve(root, "./test/server-only-stub.ts"),
    },
    // Lets the tests import modules marked `server-only`.
    conditions: ["react-server", "node", "import"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
