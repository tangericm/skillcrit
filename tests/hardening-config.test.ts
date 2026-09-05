import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.ts";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
  temps.length = 0;
});

function configDirectory(raw?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skillcrit-hardening-config-"));
  temps.push(dir);
  if (raw !== undefined) fs.writeFileSync(path.join(dir, ".skillcrit.json"), raw);
  return dir;
}

describe("configuration validation", () => {
  it("rejects an array that coerces to a valid rule severity", () => {
    const { config, warnings } = loadConfig(configDirectory('{"rules":{"SC1010":["error"]}}'));
    expect(warnings.join(" ")).toContain("SC1010");
    expect(config.rules.SC1010).toBeUndefined();
  });

  it.each(["toString", "constructor", "__proto__"])("rejects inherited rule id %s", (id) => {
    const { config, warnings } = loadConfig(configDirectory(`{"rules":{"${id}":"off"}}`));
    expect(warnings.join(" ")).toContain(id);
    expect(Object.hasOwn(config.rules, id)).toBe(false);
  });

  it("warns when an ignore array contains nonstrings", () => {
    const { config, warnings } = loadConfig(configDirectory('{"ignore":["**/valid/**",3,null,{}]}'));
    expect(warnings.join(" ")).toContain("ignore");
    expect(config.ignore).toEqual(["**/valid/**"]);
  });

  it.each([
    ['{"ignore":{}}', "ignore"],
    ['{"rules":[]}', "rules"],
    ['{"rules":null}', "rules"],
    ['{"budget":[]}', "budget"],
    ['{"budget":null}', "budget"],
    ['{"budget":{"bodyTokens":"5000"}}', "bodyTokens"],
    ['{"budget":{"bodyLines":null}}', "bodyLines"],
    ['{"budget":{"alwaysOnTokens":false}}', "alwaysOnTokens"]
  ])("warns for invalid nested config %s", (raw, field) => {
    const { warnings } = loadConfig(configDirectory(raw));
    expect(warnings.join(" ")).toContain(field);
  });

  it("reports unknown nested budget keys", () => {
    const { warnings } = loadConfig(configDirectory('{"budget":{"bodyToken":100}}'));
    expect(warnings.join(" ")).toContain("bodyToken");
  });

  it.each((["alwaysOnTokens", "bodyTokens", "bodyLines"] as const).flatMap(
    (field) => ["-1", "1e999", "-1e999"].map((value) => ({ field, value }))
  ))(
    "rejects invalid budget $field=$value", ({ field, value }) => {
      const { config, warnings } = loadConfig(configDirectory(`{"budget":{"${field}":${value}}}`));
      expect(warnings.join(" "), `${field}=${value}`).toContain(field);
      expect(config.budget[field]).toBe(DEFAULT_CONFIG.budget[field]);
    }
  );

  it("accepts null alwaysOnTokens and zero numeric budgets", () => {
    const { config, warnings } = loadConfig(configDirectory(
      '{"budget":{"alwaysOnTokens":null,"bodyTokens":0,"bodyLines":0}}'
    ));
    expect(warnings).toEqual([]);
    expect(config.budget).toEqual({ alwaysOnTokens: null, bodyTokens: 0, bodyLines: 0 });
  });

  it.each(["absent", "missing explicit", "malformed"])(
    "isolates nested default state for %s config", (mode) => {
      const dir = configDirectory(mode === "malformed" ? "{" : undefined);
      const explicit = mode === "missing explicit" ? path.join(dir, "missing.json") : undefined;
      const first = loadConfig(dir, explicit).config;
      const second = loadConfig(dir, explicit).config;
      expect(first.ignore).not.toBe(DEFAULT_CONFIG.ignore);
      expect(first.rules).not.toBe(DEFAULT_CONFIG.rules);
      expect(first.budget).not.toBe(DEFAULT_CONFIG.budget);
      first.ignore.push("**/private/**");
      first.rules.SC1010 = "off";
      first.budget.bodyTokens = 1;
      expect(second.ignore).toEqual([]);
      expect(second.rules).toEqual({});
      expect(second.budget.bodyTokens).toBe(5000);
      expect(DEFAULT_CONFIG.ignore).toEqual([]);
      expect(DEFAULT_CONFIG.rules).toEqual({});
      expect(DEFAULT_CONFIG.budget.bodyTokens).toBe(5000);
    }
  );
});
