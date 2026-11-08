// VS Code-style editor area: file tabs, breadcrumbs and an editable code view.
// Files come from shared "vsc.editor" ({files: [{path, root, on}], active}); the right side of a
// split (props.group 2) uses "vsc.editor.2". Shared "vsc.group" is the side used last: the
// Explorer opens files there and key commands act there.
// ⌘S saves (vsc-editor.save), ⌘W closes the file (vsc-editor.close).
// .ipynb files open as notebooks (notebook.js): ⇧↩ runs the focused cell (vsc-editor.run).
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, TextView } from "gpui-base";
import { fileIcon, ICON_FONT } from "./icons.js";
import { Notebook } from "./notebook.js";
import { Pdf } from "./pdf.js";
import { theme, shared, setShared, readTextFile, writeTextFile, nextCommand, settings, layout, exec, run, spaces, props } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = find(c, id); if (f) return f; }
  return null;
}
// Terminals on the right ("work" is a row) leave the editor narrow: wrap long lines then.
const narrow = () => find(layout(), "work")?.type === "row";

const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", cjs: "js", toml: "yaml", yml: "yaml",
  jsonc: "json", svelte: "html", vue: "html", astro: "html", htm: "html", sh: "bash", zsh: "bash", py: "python", rs: "rust",
  md: "markdown", h: "c", hpp: "cpp", cc: "cpp" };
// VS Code Dark Modern token colors.
const SYNTAX = { keyword: "#c586c0", string: "#ce9178", "string.escape": "#d7ba7d", comment: "#6a9955", function: "#dcdcaa",
  type: "#4ec9b0", number: "#b5cea8", constant: "#4fc1ff", boolean: "#569cd6", variable: "#9cdcfe", operator: "#d4d4d4", punctuation: "#d4d4d4" };
const EXT = { js: "ansi3", mjs: "ansi3", ts: "ansi4", tsx: "ansi4", jsx: "ansi6", json: "ansi3", md: "ansi4", py: "ansi4",
  css: "ansi6", scss: "ansi5", html: "ansi1", astro: "ansi1", rs: "ansi1", go: "ansi6", sh: "ansi2", toml: "ansi1",
  yml: "ansi5", yaml: "ansi5", lua: "ansi4", c: "ansi4", cpp: "ansi4", h: "ansi5", sol: "ansi8", tex: "ansi2" };
const ext = p => { const n = p.split("/").pop(); return n.includes(".") ? n.split(".").pop().toLowerCase() : ""; };
const base = p => p.split("/").pop();
// Code font for files, notebook cells and outputs (ships with Herdr).
const CODE_FONT = "JetBrains Mono";
const isMd = p => ["md", "markdown", "mdx"].includes(ext(p));
const keyOf = g => g === 2 ? "vsc.editor.2" : "vsc.editor";
const activeGroup = () => shared("vsc.group") ?? 1;

export default class VscEditor extends View {
  state() { return shared(this.key) ?? { files: [], active: null }; }
  setState(s) { setShared(this.key, s); }

  init(_p, cx) {
    this.group = props()?.group ?? 1;
    this.key = keyOf(this.group);
    this.docs = new Map();
    this.wrap = narrow();
    // Notebooks: kernel state and running cells (only does work while a kernel is on).
    cx.timer.every(300, cx => { for (const d of this.docs.values()) if (d.nb) cx.spawn(async cx => d.nb.poll(cx)); });
    // PDFs: show pages as pdftoppm finishes them.
    cx.timer.every(600, cx => { for (const d of this.docs.values()) if (d.pdf && !d.pdf.done) cx.spawn(async cx => { if (await d.pdf.poll()) cx.notify(); }); });
    cx.spawn(async cx => {
      for (;;) {
        const c = await nextCommand();
        // Every shown side gets each command; only the side used last acts (wrap applies to both).
        if (c !== "wrap" && c !== "nowrap" && activeGroup() !== this.group) continue;
        if (c === "save") this.save(this.state().active, cx);
        // Sent by vsc-panelbar when the terminals move: rebuild open files with the new wrap.
        if (c === "wrap" || c === "nowrap") {
          this.wrap = c === "wrap";
          for (const d of this.docs.values()) if (d.code && d.wrap !== this.wrap) this.build(d, d.code.value(), this.wrap);
        }
        if (c === "close" && this.state().active) this.closeFile(this.state().active);
        if (c === "runfile") { const d = this.docs.get(this.state().active); if (d && ext(d.file.path) === "py") await this.runPython(d, cx); }
        if (c === "preview") { const d = this.docs.get(this.state().active); if (d && isMd(d.file.path)) d.preview = !d.preview; }
        if (c === "run") { const nb = this.docs.get(this.state().active)?.nb; if (nb?.focused) await nb.run(nb.focused, cx); }
        cx.notify();
      }
    });
  }

  // The wrap setting is fixed per editor state, so a change rebuilds it with the current text.
  build(doc, text, wrap) {
    doc.code?.release();
    const e = ext(doc.file.path);
    doc.wrap = wrap;
    doc.code = EditorState.new({ language: LANG[e] ?? e ?? "txt", value: text, readonly: false, soft_wrap: wrap,
      font_family: CODE_FONT, font_size: 13, syntax: SYNTAX });
    doc.code.on("change", (_e, cx) => { const d = doc.code.value() !== doc.original; if (d !== doc.dirty) { doc.dirty = d; cx.notify(); } });
  }

  load(f, cx) {
    const doc = { file: f, code: null, original: null, dirty: false, error: null };
    this.docs.set(f.path, doc);
    if (ext(f.path) === "pdf") {
      doc.pdf = new Pdf(f);
      cx.spawn(async cx => {
        try { await doc.pdf.load(); } catch (e) { doc.error = `Can't open this PDF: ${e.message ?? e}`; doc.pdf = null; }
        cx.notify();
      });
      return;
    }
    if (ext(f.path) === "ipynb") {
      doc.nb = new Notebook(f, { group: this.group, syntax: SYNTAX, font: CODE_FONT, onDirty: () => { doc.dirty = true; } });
      cx.spawn(async cx => {
        try { await doc.nb.load(); } catch (e) { doc.error = `Can't open this notebook: ${e}`; doc.nb = null; }
        cx.notify();
      });
      return;
    }
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(f.path, { on: f.on });
        if (text === null) doc.error = "This file is no longer available";
        else if (text.includes("\0")) doc.error = "This file is binary and can't be shown.";
        else {
          doc.original = text;
          this.build(doc, text, this.wrap);
        }
      } catch { doc.error = "Can't open this file (too large or unreadable; the limit is 1 MiB)."; }
      finally { cx.notify(); }
    });
  }

  save(path, cx) {
    const doc = this.docs.get(path);
    if (doc?.nb && doc.dirty) {
      cx.spawn(async cx => {
        try { await doc.nb.save(); doc.dirty = false; doc.saveError = null; }
        catch (e) { doc.saveError = `Not saved: ${e}`; }
        cx.notify();
      });
      return;
    }
    if (!doc?.code || !doc.dirty) return;
    const text = doc.code.value();
    cx.spawn(async cx => {
      try { await writeTextFile(path, text, doc.original); doc.original = text; doc.dirty = false; doc.error = null; }
      catch (e) { doc.saveError = `Not saved: ${e}`; }
      finally { cx.notify(); }
    });
  }

  closeFile(path) {
    const s = this.state(), i = s.files.findIndex(f => f.path === path);
    const files = s.files.filter(f => f.path !== path);
    const active = s.active === path ? (files[Math.min(i, files.length - 1)]?.path ?? null) : s.active;
    this.setState({ files, active });
    if (this.group === 2 && !files.length) { run("layout.hide", { id: "editor-2" }); setShared("vsc.group", 1); }
  }

  sync(s, cx) {
    for (const f of s.files) if (!this.docs.has(f.path)) this.load(f, cx);
    for (const [p, d] of this.docs) if (!s.files.some(f => f.path === p)) {
      d.code?.release(); d.nb?.release(); d.nb?.shutdown(); this.docs.delete(p);
    }
  }

  tab(f, active, t) {
    const doc = this.docs.get(f.path), e = ext(f.path);
    return h_flex().id(`tab-${f.path}`).h_full().flex_none().pl(12).pr(6).gap(6).items_center().cursor_pointer().relative()
      .bg(active ? t.background : t.chrome).border_r(1).border_color(t.border).text_color(active ? t.foreground : t.muted)
      .on_click(() => this.setState({ ...this.state(), active: f.path }))
      .on_mouse_down("left", e => { this.drag = { path: f.path, x: e.position.x, y: e.position.y, on: false }; })
      .on_mouse_down("middle", () => this.closeFile(f.path))
      .when(active, el => el.child(div().absolute().top(0).left(0).right(0).h(1).bg(t.accent)))
      .child((([ch, col]) => div().font_family(ICON_FONT).text_size(14).text_color(col).child(ch))(fileIcon(base(f.path))))
      .child(div().child(base(f.path)))
      .child(div().id(`x-${f.path}`).size(18).flex().items_center().justify_center().rounded(4).text_color(t.muted)
        .hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => { cx.stop_propagation(); this.closeFile(f.path); })
        .child(doc?.dirty ? div().size(8).rounded(4).bg(t.foreground) : svg("mods/vsc-editor/x.svg").size(13)));
  }

  // Quitting Herdr stops every notebook kernel.
  async close() {
    for (const d of this.docs.values()) if (d.nb) await exec("sh", ["-c", 'kill "$(cat "$1/pid")" 2>/dev/null; true', "stop", d.nb.dir]);
  }

  // Split: the active file opens on the other side too (shown if hidden), and that side becomes active.
  split(path) {
    const other = this.group === 1 ? 2 : 1, key = keyOf(other);
    const s = shared(key) ?? { files: [], active: null }, f = this.state().files.find(x => x.path === path);
    if (!f) return;
    setShared(key, { files: s.files.some(x => x.path === path) ? s.files : [...s.files, f], active: path });
    setShared("vsc.group", other);
    if (other === 2) run("layout.show", { id: "editor-2" });
  }

  // Drag a tab toward the far edge to snap it to the other side, like window snapping:
  // past the threshold a highlighted half slides in; release there to move the file.
  // From the left side the zone is the right edge, from the right side the left edge.
  dragMove(e, cx) {
    const d = this.drag;
    if (!d) return;
    const x = e.position.x, y = e.position.y;
    if (!d.on && Math.hypot(x - d.x, y - d.y) < 6) return;
    d.on = true;
    const lx = e.local_position?.x ?? 0, ly = e.local_position?.y ?? 0, w = this.size?.width ?? 800;
    const zone = this.group === 1 ? lx > w * 0.62 : lx < w * 0.38;
    if (zone !== d.zone || Math.abs(lx - (d.lx ?? 0)) + Math.abs(ly - (d.ly ?? 0)) > 2) { d.zone = zone; d.lx = lx; d.ly = ly; cx.notify(); }
  }

  dragEnd(cx) {
    const d = this.drag;
    this.drag = null;
    if (d?.on && d.zone) this.moveToOther(d.path);
    cx.notify();
  }

  moveToOther(path) {
    const only = this.state().files.length === 1;
    this.split(path);
    // The last file on the left is copied (the left side never ends up empty); otherwise it moves.
    if (!(this.group === 1 && only)) this.closeFile(path);
    if (this.group === 2) setShared("vsc.group", 1);
  }

  dragOverlay(t) {
    const d = this.drag;
    if (!d?.on) return [];
    const w = this.size?.width ?? 800, h = this.size?.height ?? 600, half = Math.round(w / 2);
    const zone = div().absolute().top(0).h(h).bg(`${t.accent}26`).border_2().border_color(t.accent).rounded(6)
      .transition("width", { duration: 160, easing: "ease-out" }).transition("opacity", { duration: 160, easing: "ease-out" })
      .w(d.zone ? half - 8 : 0).opacity(d.zone ? 1 : 0)
      .when(this.group === 1, el => el.right(4)).when(this.group === 2, el => el.left(4))
      .child(div().size_full().flex().items_center().justify_center().text_size(13).text_color(t.foreground)
        .when(Boolean(d.zone), el => el.child(this.group === 1 ? "Split right" : "Move back")));
    const ghost = div().absolute().left(Math.round(d.lx) + 12).top(Math.round(d.ly) + 8).h(26).px(10).flex().items_center()
      .rounded(5).bg(t.popover).border_1().border_color(t.accent).text_size(12).text_color(t.foreground).opacity(0.92)
      .child(base(d.path));
    return [zone, ghost];
  }

  // ▶ Run for .py files: save, then run it in a terminal tab named "▶ file.py" with the project's
  // Python (the nearest .venv above the file, else python3). Running again replaces that tab.
  async runPython(doc, cx) {
    const path = doc.file.path, folder = path.slice(0, path.lastIndexOf("/")), name = `▶ ${base(path)}`;
    if (doc.dirty && doc.code) {
      const text = doc.code.value();
      try { await writeTextFile(path, text, doc.original); doc.original = text; doc.dirty = false; }
      catch (e) { doc.saveError = `Not saved, so not run: ${e}`; cx.notify(); return; }
    }
    const find = 'd="$1"; while [ "$d" != "/" ] && [ -n "$d" ]; do [ -x "$d/.venv/bin/python" ] && { echo "$d/.venv/bin/python"; exit 0; }; d=$(dirname "$d"); done; command -v python3';
    const py = (await exec("sh", ["-c", find, "find", folder], { on: doc.file.on })).stdout.trim() || "python3";
    const space = spaces().find(s => s.active);
    for (const tab of space?.tabs ?? []) if (tab.name === name) run("tab.close", { id: tab.id, confirmed: true });
    run("tab.new", { name, folder, argv: [py, path] });
  }

  // Rendered Markdown, GitHub style: a readable centered column over the live text.
  markdown(doc, t) {
    return v_flex().id("md-scroll").flex_1().min_h(0).overflow_y_scrollbar().bg(t.background)
      .child(div().w_full().max_w(900).mx_auto().px(40).py(28).text_size(15).text_color(t.foreground)
        .child(TextView.markdown(`md-${doc.file.path}`, doc.code.value())));
  }

  empty(t) {
    const row = (label, keys) => h_flex().gap(24).justify_between().w(280)
      .child(div().text_color(t.dim).child(label)).child(div().text_color(t.muted).child(keys));
    return v_flex().size_full().bg(t.background).items_center().justify_center().gap(10).text_size(13)
      .child(div().text_size(64).font_semibold().text_color(t.border).pb(18).child("❯_"))
      .child(row("Show All Commands", "⇧⌘P"))
      .child(row("Go to Space", "⌘P"))
      .child(row("New Terminal", "⌘T"))
      .child(row("Toggle Side Bar", "⌘B"))
      .child(row("Toggle Panel", "⌘J"));
  }

  render(cx) {
    const t = theme(), s = this.state();
    this.sync(s, cx);
    if (!s.files.length) return this.empty(t);
    const f = s.files.find(x => x.path === s.active) ?? s.files[0], doc = this.docs.get(f.path);
    const rel = f.path.startsWith(f.root + "/") ? f.path.slice(f.root.length + 1) : f.path;
    const mine = activeGroup() === this.group, split = !(find(layout(), "editor-2")?.hidden ?? true);
    return v_flex().id("editor").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      // Clicking anywhere on this side makes it the one the Explorer and keys act on.
      .on_mouse_down("left", () => { if (!mine) setShared("vsc.group", this.group); })
      .relative().on_size_change((size, cx) => { this.size = size; })
      .on_mouse_move((e, cx) => this.dragMove(e, cx))
      .on_mouse_up("left", (_e, cx) => this.dragEnd(cx))
      .on_hover((h, cx) => { if (!h && this.drag) { this.drag = null; cx.notify(); } })
      .when(split && mine, el => el.border_t(1).border_color(t.accent))
      .child(h_flex().h(35).flex_none().bg(t.chrome).border_b(1).border_color(t.border)
        .child(h_flex().id("tabs").flex_1().min_w(0).h_full().overflow_x_scroll()
          .children(s.files.map(x => this.tab(x, x.path === f.path, t))))
        .child(div().id("split").flex_none().h(24).px(8).mx(6).flex().items_center().rounded(4).cursor_pointer()
          .text_size(12).text_color(t.muted).hover(st => st.bg(t.hover).text_color(t.foreground))
          .on_click(() => this.split(f.path))
          .child(this.group === 1 ? "Split ⇥" : "⇤ Split")))
      .child(h_flex().h(26).flex_none().px(14).gap(4).items_center().text_size(12).text_color(t.muted)
        .children(rel.split("/").flatMap((seg, i, a) => i < a.length - 1 ? [div().child(seg), div().text_color(t.dim).child("›")] : [div().text_color(t.foreground).child(seg)]))
        .when(ext(f.path) === "py" && Boolean(doc?.code), el => el.child(div().flex_1()).child(
          div().id("py-run").h(22).px(8).gap(6).flex().items_center().rounded(4).cursor_pointer().text_color(t.ansi10)
            .hover(st => st.bg(t.hover))
            .on_click((_e, cx) => { cx.spawn(async cx => this.runPython(doc, cx)); })
            .child("▶ Run").child(div().text_color(t.dim).child("⌥⌘R"))))
        .when(isMd(f.path) && Boolean(doc?.code), el => el.child(div().flex_1()).child(
          div().id("md-preview").h(22).px(8).flex().items_center().rounded(4).cursor_pointer()
            .bg(doc.preview ? t.selected : t.background).text_color(doc.preview ? t.foreground : t.muted)
            .hover(st => st.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { doc.preview = !doc.preview; cx.notify(); })
            .child(doc.preview ? "Edit  ⇧⌘V" : "Preview  ⇧⌘V"))))
      .when(Boolean(doc?.saveError), el => el.child(div().px(14).py(4).text_size(12).text_color(t.ansi1).child(doc.saveError)))
      .child(doc?.pdf ? div().flex_1().min_h(0).child(doc.pdf.render(t))
        : doc?.nb ? div().flex_1().min_h(0).child(doc.nb.render(t))
        : doc?.code && doc.preview ? this.markdown(doc, t)
        : doc?.code ? Editor.new(doc.code).flex_1().min_h(0)
        : div().flex_1().p(16).text_color(t.dim).child(doc?.error ?? "Loading…"))
      .children(this.dragOverlay(t));
  }
}
