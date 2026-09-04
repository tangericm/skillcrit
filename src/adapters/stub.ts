import fs from "node:fs";
import path from "node:path";
import type { Adapter } from "../types.js";

export const stubAdapter: Adapter = {
  name: "stub",
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
