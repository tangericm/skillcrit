import type { Severity } from "./types.js";

/**
 * Stable rule catalogue. IDs never change meaning: a CI gate, a suppression
 * in `.skillcrit.json`, or a link in a review comment has to keep pointing at
 * the same defect across releases. New checks take new IDs; a retired check
 * keeps its ID reserved.
 *
 *   SC1xxx  Agent Skills spec conformance
 *   SC2xxx  context budget (what the agent pays for every session)
 *   SC3xxx  collisions between installed skills
 *   SC4xxx  risk inventory (signals for human review, not a verdict)
 */
export type RuleId =
  | "SC1001"
  | "SC1002"
  | "SC1003"
  | "SC1004"
  | "SC1005"
  | "SC1006"
  | "SC1007"
  | "SC1008"
  | "SC1009"
  | "SC1010"
  | "SC1013"
  | "SC1011"
  | "SC1012"
  | "SC2001"
  | "SC2002"
  | "SC2003"
  | "SC2004"
  | "SC3001"
  | "SC3002"
  | "SC3003"
  | "SC3004"
  | "SC3005"
  | "SC3006"
  | "SC4001"
  | "SC4002"
  | "SC4003"
  | "SC4004"
  | "SC4005"
  | "SC4006";

export type RuleSpec = {
  id: RuleId;
  title: string;
  severity: Severity;
  /** What the reader should do about it. */
  remediation: string;
};

export const RULES: Record<RuleId, RuleSpec> = {
  SC1013: {
    id: "SC1013",
    title: "invalid optional frontmatter field type",
    severity: "error",
    remediation: "Use strings for license and compatibility; do not supply arrays, objects, numbers or null."
  },
  SC1001: {
    id: "SC1001",
    title: "missing name",
    severity: "error",
    remediation: "Add a `name:` to the frontmatter that matches the folder."
  },
  SC1002: {
    id: "SC1002",
    title: "name does not match folder",
    severity: "warning",
    remediation:
      "The base specification requires the folder and name to match. Check the target client's naming behavior before renaming either."
  },
  SC1003: {
    id: "SC1003",
    title: "name longer than 64 characters",
    severity: "warning",
    remediation: "Shorten `name:` to 64 characters or fewer."
  },
  SC1004: {
    id: "SC1004",
    title: "name is not lowercase-hyphenated",
    severity: "warning",
    remediation:
      "Use lowercase letters, digits and single hyphens; no leading, trailing or consecutive hyphens."
  },
  SC1005: {
    id: "SC1005",
    title: "missing description",
    severity: "error",
    remediation:
      "Add a non-empty description to satisfy the base specification. Whether this skill loads must be checked in the target client."
  },
  SC1006: {
    id: "SC1006",
    title: "description longer than 1024 characters",
    severity: "error",
    remediation:
      "Trim description to 1024 characters to satisfy the base specification. Actual catalogue loading depends on the client and skill controls."
  },
  SC1007: {
    id: "SC1007",
    title: "compatibility longer than 500 characters",
    severity: "warning",
    remediation: "Trim `compatibility:` to 500 characters."
  },
  SC1008: {
    id: "SC1008",
    title: "metadata is not a string map",
    severity: "warning",
    remediation:
      "`metadata:` is a map of string keys to string values. Quote numeric values (`version: \"1.0\"`) and flatten nested objects."
  },
  SC1009: {
    id: "SC1009",
    title: "allowed-tools is not a space-separated string",
    severity: "warning",
    remediation:
      "Write `allowed-tools:` as one space-separated string, e.g. `Bash(git:*) Read`."
  },
  SC1010: {
    id: "SC1010",
    title: "unrecognized frontmatter key",
    severity: "info",
    remediation:
      "Portability note: this field is outside the base specification. Check the target client's documentation; preserve supported top-level controls such as context and disable-model-invocation."
  },
  SC1011: {
    id: "SC1011",
    title: "frontmatter could not be parsed",
    severity: "error",
    remediation:
      "Fix the YAML. The usual cause is an unquoted value containing a colon — quote it or use a block scalar."
  },
  SC1012: {
    id: "SC1012",
    title: "description does not say when to use the skill",
    severity: "info",
    remediation:
      "State what the skill does and when to use it. This wording check does not measure activation reliability; verify triggering in the target client."
  },
  SC2001: {
    id: "SC2001",
    title: "body over the recommended instruction budget",
    severity: "warning",
    remediation:
      "Keep SKILL.md under ~5000 tokens and move detail into `references/`. The whole body loads the moment the skill activates."
  },
  SC2002: {
    id: "SC2002",
    title: "body over 500 lines",
    severity: "info",
    remediation: "Split the body into `references/` files loaded on demand."
  },
  SC2003: {
    id: "SC2003",
    title: "always-on skill",
    severity: "warning",
    remediation:
      "Body wording or plugin hooks suggest reviewing context cost. Verify actual loading in the target client; this signal does not establish that the skill body is always loaded."
  },
  SC2004: {
    id: "SC2004",
    title: "always-loaded token total",
    severity: "info",
    remediation: "Estimated total for a hypothetical inventory set. Client selection and actual session usage remain unknown."
  },
  SC3001: {
    id: "SC3001",
    title: "duplicate copy",
    severity: "warning",
    remediation:
      "Equal SKILL.md bytes do not establish equivalent packages or duplicate runtime loading. Compare supporting files and client usage before removing any path."
  },
  SC3002: {
    id: "SC3002",
    title: "version conflict",
    severity: "warning",
    remediation:
      "Instruction files or metadata differ under one name. Verify client namespaces, enablement, permissions and supporting files before choosing whether either copy should change. Cleanup ranking is not runtime precedence."
  },
  SC3003: {
    id: "SC3003",
    title: "trigger contention",
    severity: "warning",
    remediation:
      "Shared trigger phrases are a heuristic, not proof of activation contention. Review intended scope and measure triggering in the target client before narrowing descriptions or disabling skills."
  },
  SC3004: {
    id: "SC3004",
    title: "overlapping trigger phrase",
    severity: "warning",
    remediation: "Review whether the skills cover different tasks. Shared wording alone does not require a rewrite or establish runtime contention."
  },
  SC3005: {
    id: "SC3005",
    title: "duplicate slash command",
    severity: "warning",
    remediation:
      "Two packs declare the same command basename. Verify the client's plugin namespaces before treating this as a conflict or renaming a command."
  },
  SC3006: {
    id: "SC3006",
    title: "shadowed skill",
    severity: "info",
    remediation:
      "Reserved for client-verified shadowing. Cleanup ranking alone cannot establish that a copy never loads."
  },
  SC4001: {
    id: "SC4001",
    title: "reaches the network",
    severity: "info",
    remediation:
      "Confirm the endpoint is expected and that nothing sensitive is sent to it."
  },
  SC4002: {
    id: "SC4002",
    title: "reads credentials or secrets",
    severity: "warning",
    remediation:
      "Confirm the skill needs the secret and does not forward it anywhere."
  },
  SC4003: {
    id: "SC4003",
    title: "downloads and executes remote code",
    severity: "warning",
    remediation:
      "Pin and vendor the payload, or split fetch and execute so the content can be reviewed first."
  },
  SC4004: {
    id: "SC4004",
    title: "destructive shell command",
    severity: "warning",
    remediation:
      "Scope the deletion to a path the skill created, and confirm before running it."
  },
  SC4005: {
    id: "SC4005",
    title: "unpinned dependency install",
    severity: "info",
    remediation:
      "Pin the version so a later publish of the package cannot change what the skill runs."
  },
  SC4006: {
    id: "SC4006",
    title: "broad allowed-tools grant",
    severity: "warning",
    remediation:
      "Narrow `allowed-tools:` to the specific commands the skill runs, e.g. `Bash(git:*)` rather than `Bash`."
  }
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  error: 3,
  warning: 2,
  info: 1
};

export function ruleIds(): RuleId[] {
  return Object.keys(RULES) as RuleId[];
}
