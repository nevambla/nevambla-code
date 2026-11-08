# Contributing

Thanks for wanting to improve nevambla-code. Bug fixes, optimizations and new features are all welcome.

## Before you start

- **Small fixes:** open a pull request directly.
- **Bigger changes or new features:** open an issue or a discussion first, so we can agree on the approach before you spend time on it.
- **Questions and ideas:** use [Discussions](https://github.com/nevambla/nevambla-code/discussions).

## How the repo is laid out

| Path | What it is |
| --- | --- |
| `herdr/config.toml` | herdr terminal settings |
| `herdr-app/layouts/nevambla-code.json` | the desktop layout |
| `herdr-app/mods/vsc-*` | the layout's panels, one mod per folder |
| `herdr-app/themes/dracula.json` | colors |
| `herdr-app/keys.json` | shortcuts, merged into the user's by `install.sh` |
| `herdr-app/RECIPE.md` | a description of the layout that an agent can rebuild it from |
| `install.sh` | the installer |

The herdr desktop app documents layouts, mods and the `herdr` API in `~/.config/herdr-app/AGENTS.md` and `~/.config/herdr-app/herdr.d.ts` on your machine.

## Making a change

1. Fork the repo and create a branch.
2. Work on your installed copy in `~/.config/herdr-app`: herdr reloads mods and layouts as you save, so you see changes live.
3. Check every mod you touched:
   ```sh
   herdr-app check mods/<mod>
   ```
4. Copy your changes back into the repo, and run `./install.sh` once from a clean state if you changed the installer.
5. If the change affects what people see or do, update `README.md` and `herdr-app/RECIPE.md`.
6. Open a pull request saying what changed, why, and how you tested it (herdr version, macOS or Linux).

## Rules

- **Nothing personal or generated:** no account names, paths like `/Users/<you>`, tokens, screenshots with private names, caches (`data/`, `.pdf/`, `.nb/`) or files herdr writes itself (`gpui-kit.d.ts`, `jsconfig.json`).
- **Keep defaults generic:** anything that depends on the user, such as Claude accounts, goes in layout `props` with a sensible default, never hard-coded.
- **Mods that run programs, read files outside their folder or use the network** must say so in the README's "What the panels do on your machine" section.
- **Keep it small:** one mod per concern, and follow the style of the existing mods.

By contributing, you agree that your contributions are licensed under the MIT License.
