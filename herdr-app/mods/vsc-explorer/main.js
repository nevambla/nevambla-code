// VS Code-style Explorer: the focused pane's folder as a tree. Clicking a file
// opens it in the vsc-editor block (shared "vsc.editor").
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { fileIcon, folderIcon, ICON_FONT } from "./icons.js";
import { spaces, panes, focused, exec, watchFolder, theme, shared, setShared, layout } from "herdr";

// Files open on the editor side used last (vsc-editor's split), while that side is shown.
function findNode(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = findNode(c, id); if (f) return f; }
  return null;
}
const editorKey = () => shared("vsc.group") === 2 && findNode(layout(), "editor-2")?.hidden === false ? "vsc.editor.2" : "vsc.editor";

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}
const key = () => JSON.stringify(location());
const PER_FOLDER = 500, TOTAL = 5000;
const HIDE = new Set([".git", ".DS_Store"]);

async function directory(path, on) {
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  const r = await exec("sh", ["-c", script, "files", path], { on });
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const f = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < f.length; i += 2) if (!HIDE.has(f[i + 1])) out.push({ name: f[i + 1], dir: f[i] === "d" });
  return out;
}

// File-type tint, like VS Code's icon themes.
const EXT = { js: "ansi3", mjs: "ansi3", ts: "ansi4", tsx: "ansi4", jsx: "ansi6", json: "ansi3", md: "ansi4", py: "ansi4",
  css: "ansi6", scss: "ansi5", html: "ansi1", astro: "ansi1", rs: "ansi1", go: "ansi6", sh: "ansi2", toml: "ansi1",
  yml: "ansi5", yaml: "ansi5", lua: "ansi4", c: "ansi4", cpp: "ansi4", h: "ansi5", sol: "ansi8", tex: "ansi2" };

export default class VscExplorer extends View {
  init(_p, cx) {
    this.saved = new Map(); this.entries = new Map(); this.folders = new Set(); this.marks = {}; this.rootOpen = true;
    this.refresh(cx);
    // The folder watcher catches changes as they happen; this is only a fallback (remote
    // folders, missed events), and it skips work while the side bar is hidden.
    cx.timer.every(60000, cx => { if (findNode(layout(), "side")?.hidden !== true) this.refresh(cx); });
  }

  current(ctx) { return this.context === ctx && key() === ctx.key; }

  async loadFolder(path, ctx) {
    const entries = await directory(path ? `${ctx.cwd}/${path}` : ctx.cwd, ctx.on);
    if (!this.current(ctx) || (path && !this.folders.has(path))) return;
    this.entries.set(path, entries.slice(0, PER_FOLDER).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
  }

  watch(ctx, cx) {
    if (ctx.on || this.watched === ctx.cwd) return;
    this.watched = ctx.cwd;
    cx.spawn(async cx => {
      try { while (this.context === ctx) { await watchFolder(ctx.cwd); if (this.current(ctx)) this.refresh(cx); } }
      catch { if (this.context === ctx) this.watched = null; }
    });
  }

  refresh(cx) {
    const { cwd, on } = location(), next = key();
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, this.folders);
      this.context = { key: next, cwd, on }; this.entries = new Map(); this.folders = new Set(this.saved.get(next));
      this.marks = {}; this.watched = null; this.error = null; this.loading = false;
    }
    if (!cwd || this.loading) return;
    const ctx = this.context; this.loading = true;
    cx.spawn(async cx => {
      try {
        for (const p of ["", ...this.folders]) { if (!this.current(ctx)) return; await this.loadFolder(p, ctx); }
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        const marks = {};
        if (top?.code === 0) {
          const st = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch(() => null);
          if (st?.code === 0) for (const e of st.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = e.slice(0, 2), full = `${top.stdout.trim()}/${e.slice(3)}`;
            const m = xy === "??" ? "U" : xy.includes("A") ? "A" : xy.includes("D") ? "D" : "M";
            marks[full] = m;
            // Folders containing changes get a dot, like VS Code.
            for (let d = full.slice(0, full.lastIndexOf("/")); d.length > cwd.length; d = d.slice(0, d.lastIndexOf("/"))) marks[d] ??= "•";
          }
        }
        if (!this.current(ctx)) return;
        this.marks = marks; this.error = null; this.watch(ctx, cx);
      } catch (e) { if (this.current(ctx)) this.error = String(e); }
      finally { if (this.context === ctx) this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const f of [...this.folders]) if (f === path || f.startsWith(path + "/")) { this.folders.delete(f); this.entries.delete(f); }
    } else {
      this.folders.add(path);
      const ctx = this.context;
      cx.spawn(async cx => { try { await this.loadFolder(path, ctx); } catch (e) { this.error = String(e); } finally { cx.notify(); } });
    }
    cx.notify();
  }

  open(path) {
    const ctx = this.context, abs = `${ctx.cwd}/${path}`;
    const key = editorKey(), ed = shared(key) ?? { files: [], active: null };
    const files = ed.files.some(f => f.path === abs) ? ed.files : [...ed.files, { path: abs, root: ctx.cwd, on: ctx.on ?? null }];
    setShared(key, { files, active: abs });
  }

  // The open tree as plain data; only the visible rows become elements.
  flatten(prefix, depth, out) {
    for (const e of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      out.push({ e, path, depth });
      if (e.dir && this.folders.has(path)) this.flatten(path, depth + 1, out);
    }
    return out;
  }

  glyph([char, color]) {
    return div().w(16).flex_none().flex().justify_center().font_family(ICON_FONT).text_size(14).text_color(color).child(char);
  }

  row({ e, path, depth }, t, active) {
    const abs = `${this.context.cwd}/${path}`, open = this.folders.has(path);
    const mark = this.marks[abs], sel = abs === active;
    const markColor = mark === "U" || mark === "A" ? t.ansi2 : mark === "D" ? t.ansi1 : t.blocked;
    const ext = e.name.includes(".") ? e.name.split(".").pop().toLowerCase() : "";
    return h_flex().id(`f-${path}`).h(22).flex_none().pl(12 + depth * 12).pr(10).gap(5).items_center().cursor_pointer()
      .when(sel, el => el.bg(t.selected)).hover(s => s.bg(sel ? t.selected : t.hover))
      .on_click((_e, cx) => e.dir ? this.toggle(path, cx) : this.open(path))
      .child(e.dir ? svg(`mods/vsc-explorer/chevron-${open ? "down" : "right"}.svg`).size(14).flex_none().text_color(t.muted)
                   : div().w(14).flex_none())
      .child(this.glyph(e.dir ? folderIcon(open) : fileIcon(e.name)))
      .child(div().flex_1().min_w(0).truncate().text_color(mark && mark !== "•" ? markColor : t.foreground).child(e.name))
      .when(Boolean(mark), el => el.child(div().flex_none().text_size(11).text_color(markColor).child(mark)));
  }

  render(cx) {
    if (key() !== this.context?.key) this.refresh(cx);
    const t = theme(), active = shared(editorKey())?.active;
    const name = (this.context?.cwd ?? "").split("/").filter(Boolean).pop() ?? "";
    const items = this.rootOpen ? this.flatten("", 0, []) : [];
    return v_flex().id("explorer").size_full().min_h(0).bg(t.chrome).text_color(t.foreground).text_size(13)
      .child(h_flex().h(35).flex_none().px(20).items_center().text_size(11).text_color(t.muted).child("EXPLORER"))
      .child(h_flex().id("root").h(22).flex_none().px(4).gap(4).items_center().cursor_pointer().text_size(11).font_semibold()
        .on_click((_e, cx) => { this.rootOpen = !this.rootOpen; cx.notify(); })
        .child(svg(`mods/vsc-explorer/chevron-${this.rootOpen ? "down" : "right"}.svg`).size(14).text_color(t.muted))
        .child(div().truncate().child(name.toUpperCase() || "NO FOLDER")))
      .when(this.rootOpen && items.length > 0, el => el.child(v_flex().id("tree").flex_1().min_h(0).overflow_y_scrollbar().pb(8)
        .children(items.map(it => this.row(it, t, active)))))
      .when(this.rootOpen && (Boolean(this.error) || !items.length), el => el.child(div().px(20).py(6).text_size(12).text_color(t.dim)
        .child(this.error || (this.loading ? "Loading…" : "Empty folder"))));
  }
}
