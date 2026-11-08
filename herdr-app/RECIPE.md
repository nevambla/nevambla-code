# nevambla-code

An editor-style herdr window in Dracula colors: a slim title bar with your Claude plan usage, an activity bar, a file explorer with your spaces and agents underneath, an editor with tabs, and the herdr terminals in a panel beside it. Agents run in the terminals while you read and edit their files next to them.

## What you see

Left to right under a 45 px title bar, all in the `dracula` theme with JetBrainsMono Nerd Font at 13 px and terminal padding 6 × 12:

1. **Title bar** (`vsc-titlebar`, 45 px, drags the window, system title bar hidden, traffic lights at 14, 11). On the left: "Claude" in #d97757 with two small meters, Session (5 h) and Week (7 d), each showing the percent left and the time until it resets. In the center: a 380 px command-center box with the active space's name ("<space> — Herdr") that opens the palette. On the right: side bar and editor toggles, then a 24 h clock.
2. **Activity bar** (`vsc-activity`, 48 px): icons for Explorer, Source Control (Changes) and Spaces. Clicking the shown one again hides the side bar.
3. **Side bar** (378 px, resizable 170–520, chrome background): a stack showing one of `vsc-explorer` (the focused pane's folder as a tree), herdr's `changes` or herdr's `spaces`. Underneath, a resizable dock with `vsc-spaces` (one row per space in its herdr color, + for a new one) above `vsc-agents` (agents grouped or by priority) in a 1 : 2 ratio.
4. **Editor** (`vsc-editor`, about 54 % of the rest): file tabs, breadcrumbs and an editable code view; a second group (`props.group: 2`) is there for splits and starts hidden.
5. **Terminal panel** (about 46 %): a 24 px `vsc-panelbar` ("TERMINAL" on the left; the space's tabs, new tab, split and maximize on the right) over the active tab's panes. Panes are square-cornered with a 1 px border, no gap, and a 28 px `pane` header always shown on top.

## How it behaves

- **Agents:** `vsc-agents` lists them by state. Blocked and done agents need attention and sort first. A parent takes the place of its most urgent sub-agent. A done agent you have looked at stays in Done until you leave it.
- **Usage:** hovering or clicking "Claude" opens `vsc-usage`, a 470 px dropdown with every configured account and its meters. Clicking an account shows it in the title bar. Usage refreshes every 5 minutes and on click. A failed refresh keeps the last values and marks them stale. Accounts come from the title bar block's `props.accounts` (`name`, optional `config_dir`, `command`, `id`); without them the default `claude` login is shown.
- **Files:** clicking a file in the Explorer opens it in the last-used editor group. ⌘S saves, ⌘W closes, ⌘⇧V toggles a Markdown preview, ⌘⌥R runs a Python file. `.ipynb` files open as notebooks whose cells run on a real Jupyter kernel (⇧↩ or ⌘↩). PDFs render page by page.
- **Panels:** ⌘B toggles the side bar, ⌘J the terminal panel, ⌘⌥J moves the terminal panel between the bottom and the right.

## Built from

- **Layout:** `layouts/nevambla-code.json`. Root column: `titlebar` block, then `body` row of `activity` block, `side` column (`side-body` stack of `explorer` / `changes` / `spaces`, then `agents-dock` column of `spaces-switch` and `agents-list`), and `work` row (`editor` row of `editor-1` and hidden `editor-2`, then `termpanel` column of `panelbar` and the `main` tab block).
- **Mods:** `vsc-titlebar`, `vsc-usage`, `vsc-activity`, `vsc-explorer`, `vsc-spaces`, `vsc-agents` (cloned from herdr's `agents`), `vsc-editor`, `vsc-panelbar`; herdr's own `changes`, `spaces` and `pane`.
- **Shared state:** `vsc.usage`, `vsc.usage.shown`, `vsc.editor`, `vsc.editor.2`, `vsc.group`, `vsc.sections`.
- **Programs:** `vsc-titlebar/usage.sh` reads the Claude Code login from the macOS Keychain and calls `https://api.anthropic.com/api/oauth/usage`. `vsc-editor` runs `python3` with `kernel.py` (needs `jupyter_client` and `ipykernel`), `pdftoppm` and `pdfinfo` from poppler, and `open`. Caches go to `data/vsc-editor/`.
- **Art:** small stroke SVG icons in each mod folder; the `dracula` theme in `themes/dracula.json`; JetBrainsMono Nerd Font.
