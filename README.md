<p align="center">
  <img src="docs/icon.png" width="128" alt="skillcrit" />
</p>

<h1 align="center">skillcrit</h1>

<p align="center">
  Find duplicate and conflicting [Agent Skills](https://agentskills.io), then eval a pack <strong>on vs off</strong>.
</p>

<p align="center">
  <a href="https://skills.sh/tangericm/skillcrit"><img src="docs/badge.svg" alt="skillcrit" /></a>
</p>

## Install

```bash
npx skills add tangericm/skillcrit
```

```bash
npm i -g skillcrit
```

```bash
claude plugin marketplace add tangericm/skillcrit
claude plugin install skillcrit@skillcrit
```

## Usage

```bash
skillcrit roots
skillcrit lint . --user --fix --out skillcrit-cleanup.md
skillcrit eval path/to/pack
```

```
skillcrit roots [path]             # project + user skill/plugin locations
skillcrit scan [path] [--user]     # inventory
skillcrit lint [path] [--user]     # conflicts, duplicates, tokens
skillcrit lint [path] --fix        # dry-run keep/orphan markdown
skillcrit lint [path] --fix --out skillcrit-cleanup.md
skillcrit eval <pack>              # pack on vs off
```

## License

[MIT](LICENSE)
