# skillcrit

Lint stacked [Agent Skills](https://agentskills.io) packs and eval a pack **on vs off**.

[![skills.sh](https://skills.sh/b/tangericm/skillcrit)](https://skills.sh/tangericm/skillcrit)

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
skillcrit lint . --user --fix
skillcrit eval path/to/pack
```

```
skillcrit roots [path]             # project + user skill/plugin locations
skillcrit scan [path] [--user]     # inventory
skillcrit lint [path] [--user]     # conflicts, duplicates, tokens
skillcrit lint [path] --fix        # dry-run cleanup plan
skillcrit eval <pack>              # pack on vs off
```

## License

[MIT](LICENSE)
