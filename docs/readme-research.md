# README and discoverability review

Prepared September 6, 2026 for Skillcrit's maintainer. Scope: the public GitHub entry page, repository metadata, and icon; audience: developers deciding whether to try a local agent-skill audit CLI.

## Decision

Use a short, outcome-led README with one supported installation path, an immediate audit command, a real finding, practical task navigation, and linked reference documentation. Keep limitations near the claims they qualify. Use the About description and topics to accurately describe the utility. Replace the crossed-out-document icon with an inspection symbol that remains legible at small sizes.

This is a design inference from the sources below, not evidence that a particular README format increases adoption. No new testimonials, download claims, security guarantees, or performance numbers are justified.

## Comparative evidence

The sample covers six established developer tools selected for relevant CLI, linting, or scanning workflows. GitHub API popularity snapshots were checked on September 6, 2026; stars are a selection signal, not a measure of documentation quality or user satisfaction. The README sources use mutable default branches.

| Repository | Stars at inspection | Observed organization | Applied to Skillcrit |
| --- | ---: | --- | --- |
| [Ruff](https://github.com/astral-sh/ruff/blob/main/README.md) | 49,522 | Precise positioning, linked benchmark, capabilities and social proof before installation; usage and deeper documentation follow. | State a concrete job, link genuine evidence, and omit unsupported performance or endorsement claims. |
| [ESLint](https://github.com/eslint/eslint/blob/main/README.md) | 27,495 | Product definition and navigation, prerequisites, setup/invocation, configuration, severity behavior, support boundaries and contribution routes. | Closest entry flow for an npm audit CLI: install, run, interpret, configure, and find help. |
| [Knip](https://github.com/webpro-nl/knip/blob/main/packages/knip/README.md) | 12,184 | Compact purpose and documentation/integration links; the root README points to this package README. No installation walkthrough here. | Keep the entry page concise, but retain a runnable first audit because Skillcrit has no separate full documentation site. |
| [Gitleaks](https://github.com/gitleaks/gitleaks/blob/master/README.md) | 29,128 | A concrete finding with rule and source information, followed by installation, usage, baselines and configuration. Its opening also states feature-complete maintenance status. | Show an actual abbreviated finding and its interpretation. Use this as a reporting example, not evidence for growth or an unrestricted contribution model. |
| [uv](https://github.com/astral-sh/uv/blob/main/README.md) | 89,525 | Clear category, linked benchmark, highlights, installation and task-oriented command/output examples connected to deeper docs. | Organize examples around user questions and observable results. Do not borrow its speed claims. |
| [Trivy](https://github.com/aquasecurity/trivy/blob/main/README.md) | 37,801 | Separates inspected targets from issue types; quickstart offers a few installation choices and points to fuller docs; secondary results can be collapsed. | Distinguish skill locations from the checks performed; keep the main path short and link the full support matrix. |

Five of six provide runnable installation/use examples, but they disagree on section order and length. Ruff's proof-first opening and Knip's link hub are important counterexamples to a universal install-first template. The common pattern is clear positioning, practical entry points, and deeper navigation.

## GitHub guidance and metadata

GitHub describes a README as an explanation of what a project does, why it is useful, how to get started, where to find help, and who maintains it. This supports the new purpose → quickstart → tasks → boundaries → support structure. [GitHub: About READMEs](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)

Default repository search considers names, descriptions, and topics; README contents can be searched explicitly. Therefore a precise About description and relevant topics are useful discovery metadata, though neither guarantees placement, stars, or adoption. [GitHub: Repository search](https://docs.github.com/en/search-github/searching-on-github/searching-for-repositories)

Topics should describe purpose, subject, community, or language. Skillcrit uses agent-skills, ai-agents, skill-audit, developer-tools, cli, linter, static-analysis, typescript, nodejs, sarif, github-actions, claude-code, cursor, and codex. Client names describe integrations, not authorship. [GitHub: Repository topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)

A custom social preview is a separate repository setting; it is not the README icon. GitHub recommends 1280 × 640 pixels for best display, in PNG/JPG/GIF under 1 MB. An icon replacement alone does not configure that setting. [GitHub: Social preview](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)

## Visual decision

The old icon combined stacked documents, several accent marks, a thin border and a diagonal slash. My design judgment is that the slash can imply deletion, while this utility performs inspection and advisory cleanup. A single document and magnifier should communicate the task more directly. Preserve the existing black/white/lime palette, use broad shapes, and inspect small-size presentation. This is an editorial assessment, not user testing.

## Verification and limits

The example finding was produced by the published 0.5.2 CLI against a controlled fixture; its source location and remediation were copied from actual output. The new README labels it as abbreviated. CI, npm-version and license badges reference real resources; adoption and downloads are not presented as quality measures.

The highest-impact comparisons were independently spot-checked against ESLint, Gitleaks and the actual Knip package README. Official GitHub guidance supports the metadata decisions. Discovery stopped after all decision slots had first-party support and the principal counterexamples were reconciled; further broad searching was unlikely to change this modest presentation decision.

This is a purposive sample of popular repositories, not a randomized study or a conversion experiment. Source branches and popularity change over time. No evidence establishes that copying these patterns causes more stars or repeat use; post-release opt-in feedback is still needed to measure usefulness.
