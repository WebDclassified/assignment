import { defineConfig } from "vitest/config";
import { config as loadDotenv } from "dotenv";

// Integration runs point at a real, disposable test database configured in
// .env.test instead of the in-memory MongoDB used by the default test run.
loadDotenv({ path: ".env.test" });

export default defineConfig({
  test: {
    environment: "node",
  },
});
