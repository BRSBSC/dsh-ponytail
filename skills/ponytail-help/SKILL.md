---
name: ponytail-help
description: >
  Quick reference for ponytail levels, skills and commands. One-shot display.
  Use for /ponytail-help, "ponytail help", "how do I use ponytail".
---

# Ponytail Help

Display this reference card when invoked. One-shot, do NOT change mode,
write flag files, or persist anything.

## Levels

| Level | Trigger | What change |
|-------|---------|-------------|
| **Lite** | `/ponytail lite` | Build what was asked; first names the smaller option in one line. |
| **Full** | `/ponytail` | The smallest complete change, a check where the logic needs one, and a reply that names what was skipped and any risk. Default. |
| **Ultra** | `/ponytail ultra` | Also names, before building, each requested part the need does not justify; still builds it unless you drop it. |

The level stays until you change it.

## Skills

| Skill | Trigger | What it does |
|-------|---------|--------------|
| **ponytail** | `/ponytail` | Lazy mode itself: least new code, clear replies that name skipped work and risks. |
| **ponytail-review** | `/ponytail-review` | Quality review of a diff: bugs, security, load, missing tests, speed, what to cut. Each finding says what goes wrong and how to fix it. |
| **ponytail-audit** | `/ponytail-audit` | The same quality review for the whole repo, ranked. |
| **ponytail-debt** | `/ponytail-debt` | Harvest `shortcut:` comments into a tracked ledger. |
| **ponytail-gain** | `/ponytail-gain` | Measured-impact scoreboard: less code, less cost, more speed. |
| **ponytail-help** | `/ponytail-help` | This card. |

In DeepSeek Harness all six are slash commands, registered by this plugin. Type
`/` in the composer to see them.

## Deactivate

`/ponytail off` turns the rules off; the model gets one line telling it to drop
them. `/ponytail` with no argument reports the current level, and switches off
back to full. Resume with `/ponytail` or the banner above the composer.

## Level

The level is this plugin's `mode` setting. `/ponytail lite|full|ultra|off`
writes it, the banner above the composer switches it, and both persist per
profile in `cordis.patch.yml`:

```yaml
- id: ponytail
  name: dsh-ponytail
  config:
    mode: full
```

A `mode` pinned in the home patch or a `--patch` overlay wins; switching then
fails and the reason is shown.

## Update

```sh
dsh plugin --profile <profile> add github:BRSBSC/dsh-ponytail#<sha>
```

Pin a commit, then restart the app or reload the profile.

## More

Rules text and upstream docs: https://github.com/DietrichGebert/ponytail

