import fs from "node:fs";
import path from "node:path";
import type { Adapter } from "../types.js";

/**
 * Fixture replay. It copies the task's recorded `on/` or `off/` tree into the
 * work repo and never contacts a model, so it exercises the eval harness —
 * copying, running the task's tests, counting lines — with zero variance and
 * no API key.
 *
 * It measures nothing about any agent. Numbers it produces are properties of
 * the fixtures, not evidence that a skill helps.
 */
export const stubAdapter: Adapter = {
  name: "stub",
  summary: "replays recorded fixtures; no model call, no API key, zero variance",
  synthetic: true,
  async run({ repo, taskDir, skillsPath }) {
    const overlay = path.join(taskDir, skillsPath ? "on" : "off");
    if (!fs.existsSync(overlay)) {
      throw new Error(`stub adapter missing ${overlay}`);
    }
    copyOverlay(overlay, repo);
    return {};
  }
};

function copyOverlay(src: string, dest: string): void {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyOverlay(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}
