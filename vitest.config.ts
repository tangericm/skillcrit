import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Several suites spawn child processes (tsc, node, npm). On a cold or
    // contended Windows runner those take seconds, and the 5s default made
    // green-ness depend on machine load rather than on the code.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Vitest offers `isolate: false` for ~0.6s. Declined: skillcrit's
    // dependencies keep module-level state — gray-matter caches parsed files
    // process-wide — and sharing a worker across suites would let one file's
    // scan decide what another file sees. That class of bug is exactly what
    // these tests exist to catch.
    isolate: true
  }
});
