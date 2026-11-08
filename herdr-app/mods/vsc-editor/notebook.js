// Jupyter notebooks in vsc-editor: cells you can edit and run against a real kernel.
// The kernel lives in kernel.py (a background helper started per notebook with the
// project's Python: the nearest .venv, else python3). We talk to it through files in
// data/vsc-editor/nb/<hash>/ (outside the mod folder: no reload, never shared).
import { div, image } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, TextView } from "gpui-base";
import { exec, writeTextFile, readTextFile, appHome } from "herdr";
import { highlight } from "./pyhl.js";

const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(16); };
const joined = s => Array.isArray(s) ? s.join("") : (s ?? "");
// nbformat stores text as a list of lines that keep their "\n".
const lines = text => { const a = text.split("\n").map((l, i, all) => i < all.length - 1 ? l + "\n" : l); if (a[a.length - 1] === "") a.pop(); return a; };
const MAX_LINES = 200;
// Code cells grow to fit their text: rows after wrapping x line height.
// JetBrains Mono at 13px: 21px per line, 0.6em (7.8px) per character.
const LINE_H = 21, CHAR_W = 7.8, CELL_CHROME = 12 + 16;  // cell padding + the editor's own inset
let seq = 0;

const FIND_PYTHON = 'd="$1"; while [ "$d" != "/" ] && [ -n "$d" ]; do [ -x "$d/.venv/bin/python" ] && { echo "$d/.venv/bin/python"; exit 0; }; d=$(dirname "$d"); done; command -v python3';

export class Notebook {
  constructor(file, { group, syntax, font, onDirty }) {
    this.file = file; this.syntax = syntax; this.font = font; this.onDirty = onDirty;
    this.cells = []; this.dirty = false; this.kernel = { state: "off" }; this.pending = new Map();
    // One kernel per notebook per side: the same notebook open on both sides gets two.
    this.dir = `${appHome()}/data/vsc-editor/nb/${hash(file.path + (group > 1 ? `#${group}` : ""))}`;
  }

  // ---------- loading and saving ----------
  async load() {
    const r = await exec("cat", [this.file.path], { on: this.file.on });  // no 1 MiB limit, unlike readTextFile
    if (r.code !== 0) throw new Error(r.stderr || "Can't read this notebook");
    this.original = r.stdout;
    this.nb = JSON.parse(r.stdout);
    await exec("mkdir", ["-p", `${this.dir}/inbox`, `${this.dir}/out`, `${this.dir}/img`]);
    // Notebooks not opened for a week: drop their cached images and kernel files.
    exec("sh", ["-c", 'find "$1" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} + 2>/dev/null; touch "$2"',
      "clean", `${appHome()}/data/vsc-editor/nb`, this.dir]).catch(() => {});
    let imgs = {};
    const x = await exec("sh", ["-c", `python3 "$0" extract "$1" < "$2"`, `${appHome()}/mods/vsc-editor/kernel.py`, this.dir, this.file.path]).catch(() => null);
    try { imgs = JSON.parse(x?.stdout || "{}"); } catch {}
    this.cells = (this.nb.cells ?? []).map((c, ci) => this.makeCell(c, ci, imgs));
  }

  makeCell(c, ci = -1, imgs = {}) {
    const cell = { key: `c${seq++}`, type: c.cell_type, meta: c.metadata ?? {}, id: c.id, attachments: c.attachments,
      text: joined(c.source), outputs: (c.outputs ?? []).map((o, oi) => imgs[`${ci}/${oi}`] ? { ...o, _img: imgs[`${ci}/${oi}`] } : o),
      count: c.execution_count ?? null, editing: false, code: null };
    if (cell.type === "code") this.editorFor(cell);
    return cell;
  }

  editorFor(cell) {
    cell.code = EditorState.new({ language: cell.type === "code" ? "python" : "markdown", value: cell.text, line_numbers: false,
      folding: false, soft_wrap: true, font_family: this.font, font_size: 13, syntax: this.syntax });
    cell.code.on("change", (_e, cx) => { cell.text = cell.code.value(); this.touch(cx); });
    cell.code.on("focus", () => { this.focused = cell; });
    cell.code.on("blur", (_e, cx) => {
      if (cell.type === "markdown" && cell.editing) cell.editing = false;
      if (this.active === cell) this.active = null;  // back to static text: the wheel scrolls the notebook again
      cx.notify();
    });
  }

  touch(cx) { if (!this.dirty) { this.dirty = true; this.onDirty?.(); } cx?.notify(); }

  toJSON() {
    const strip = o => { const { _img, ...rest } = o; return rest; };
    const cells = this.cells.map(c => {
      const base = { cell_type: c.type, ...(c.id ? { id: c.id } : {}), metadata: c.meta, source: lines(c.text) };
      if (c.attachments) base.attachments = c.attachments;
      if (c.type === "code") { base.execution_count = c.count; base.outputs = c.outputs.map(strip); }
      return base;
    });
    return JSON.stringify({ ...this.nb, cells }, null, 1) + "\n";
  }

  async save() {
    const text = this.toJSON();
    await writeTextFile(this.file.path, text, this.original);
    this.original = text; this.dirty = false;
  }

  // ---------- the kernel ----------
  async request(req) {
    await writeTextFile(`${this.dir}/inbox/${Date.now()}-${seq++}.json`, JSON.stringify(req), null);
  }

  async startKernel(cx) {
    if (this.kernel.state !== "off" && this.kernel.state !== "dead") return;
    this.kernel = { state: "starting" }; cx.notify();
    const folder = this.file.path.slice(0, this.file.path.lastIndexOf("/"));
    const py = (await exec("sh", ["-c", FIND_PYTHON, "find", folder])).stdout.trim() || "python3";
    await exec("sh", ["-c", 'rm -f "$1"/status.json "$1"/inbox/* "$1"/out/*; nohup "$2" "$3" serve "$1" "$4" > "$1/log" 2>&1 &',
      "start", this.dir, py, `${appHome()}/mods/vsc-editor/kernel.py`, folder]);
    this.kernel = { state: "starting", python: py };
  }

  async run(cell, cx) {
    if (!cell || cell.type !== "code") return;
    await this.startKernel(cx);
    const id = `r${Date.now()}-${seq++}`;
    cell.outputs = []; cell.running = id; cell.queued = true;
    this.pending.set(id, cell);
    await this.request({ op: "run", id, code: cell.text });
    this.touch(cx);
  }

  async runAll(cx) { for (const c of this.cells) if (c.type === "code") await this.run(c, cx); }
  async interrupt() { if (this.kernel.state === "busy" || this.kernel.state === "idle") await this.request({ op: "interrupt" }); }
  async restart(cx) {
    if (this.kernel.state === "off" || this.kernel.state === "dead") return this.startKernel(cx);
    for (const c of this.pending.values()) { c.running = null; c.queued = false; }
    this.pending.clear();
    await this.request({ op: "restart" });
  }
  async shutdown() {
    if (this.kernel.state === "off") return;
    await exec("sh", ["-c", 'kill "$(cat "$1/pid")" 2>/dev/null; true', "stop", this.dir]).catch(() => {});
    this.kernel = { state: "off" };
  }

  // Called on a timer: kernel state and the progress of running cells.
  async poll(cx) {
    if (this.kernel.state === "off") return;
    let changed = false;
    try {
      const s = JSON.parse((await readTextFile(`${this.dir}/status.json`)) ?? "null");
      if (s && (s.state !== this.kernel.state || s.error !== this.kernel.error)) { this.kernel = { ...this.kernel, ...s }; changed = true; }
      if (!s && this.kernel.state === "starting") {
        const log = (await readTextFile(`${this.dir}/log`)) ?? "";
        if (/Error|Traceback/.test(log)) { this.kernel = { state: "dead", error: log.trim().split("\n").pop() }; changed = true; }
      }
    } catch {}
    for (const [id, cell] of this.pending) {
      try {
        const r = JSON.parse((await readTextFile(`${this.dir}/out/${id}.json`)) ?? "null");
        if (!r) continue;
        cell.queued = false; cell.outputs = r.outputs; if (r.count != null) cell.count = r.count;
        if (r.state === "done") { this.pending.delete(id); cell.running = null; exec("rm", ["-f", `${this.dir}/out/${id}.json`]).catch(() => {}); }
        changed = true;
      } catch {}
    }
    if (changed) cx.notify();
  }

  // ---------- cells ----------
  add(type, cx) {
    const cell = this.makeCell({ cell_type: type, metadata: {}, source: "", outputs: [], execution_count: null, id: Math.random().toString(16).slice(2, 10) });
    if (type === "markdown") { cell.editing = true; this.editorFor(cell); }
    const at = this.focused ? this.cells.indexOf(this.focused) + 1 : this.cells.length;
    this.cells.splice(at || this.cells.length, 0, cell);
    this.focused = cell; this.touch(cx);
  }
  remove(cell, cx) { cell.code?.release(); this.cells = this.cells.filter(c => c !== cell); if (this.focused === cell) this.focused = null; this.touch(cx); }
  move(cell, d, cx) {
    const i = this.cells.indexOf(cell), j = i + d;
    if (j < 0 || j >= this.cells.length) return;
    [this.cells[i], this.cells[j]] = [this.cells[j], this.cells[i]]; this.touch(cx);
  }
  clearOutputs(cx) { for (const c of this.cells) if (c.type === "code") { c.outputs = []; c.count = null; } this.touch(cx); }
  release() { for (const c of this.cells) c.code?.release(); }

  // ---------- drawing ----------
  // A code cell you aren't editing: highlighted static text, which lets the wheel scroll the
  // notebook (the code editor keeps the wheel for itself). A click turns it into the editor.
  staticCode(c, t) {
    const color = k => k === "text" || k === "space" ? "#d4d4d4" : this.syntax[k] ?? "#d4d4d4";
    return v_flex().id(`static-${c.key}`).w_full().px(4).py(1).cursor_text().font_family(this.font).text_size(13)
      .on_mouse_down("left", (_e, cx) => { this.active = c; this.focused = c; cx.notify(); })
      .children(highlight(c.text).map(pieces => h_flex().flex_wrap().min_h(LINE_H).items_center()
        .children(pieces.map(([tok, kind]) => div().text_color(color(kind)).child(kind === "space" ? "\u00a0".repeat(tok.length) : tok)))));
  }

  // How many screen rows the text takes in a cell this wide, counting wrapped lines.
  rows(text) {
    const perRow = Math.max(20, Math.floor(((this.width ?? 900) - 32 - CELL_CHROME) / CHAR_W));
    return text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.replace(/\t/g, "    ").length / perRow)), 0);
  }

  button(id, label, t, action, color) {
    return div().id(id).h(24).px(8).flex().items_center().rounded(4).cursor_pointer().text_size(12)
      .text_color(color ?? t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.spawn(async cx => { try { await action(cx); } catch (e) { this.kernel = { ...this.kernel, error: String(e) }; } cx.notify(); }); });
  }

  textBlock(text, color) {
    let ls = text.replace(/\n$/, "").split("\n");
    const cut = ls.length > MAX_LINES ? ls.length - MAX_LINES : 0;
    if (cut) ls = ls.slice(-MAX_LINES);
    return v_flex().font_family(this.font).text_size(12).text_color(color)
      .when(cut > 0, el => el.child(div().opacity(0.6).child(`… ${cut} earlier lines hidden`)))
      .children(ls.map(l => div().child(l.length ? l : " ")));
  }

  output(o, t) {
    if (o.output_type === "stream") return this.textBlock(joined(o.text), o.name === "stderr" ? t.ansi9 : t.foreground);
    if (o.output_type === "error") return v_flex().gap(2)
      .child(div().font_family(this.font).text_size(12).text_color(t.ansi9).child(`${o.ename}: ${o.evalue}`))
      .child(this.textBlock((o.traceback ?? []).join("\n"), t.muted));
    if (o._img) {
      const w = Math.min(o._img.w || 600, 720), h = o._img.w ? Math.round(o._img.h * w / o._img.w) : 400;
      return image(o._img.path.replace(appHome() + "/", "")).w(w).h(h);
    }
    const data = o.data ?? {};
    if (data["text/markdown"]) return TextView.markdown(`md-${seq}`, joined(data["text/markdown"]));
    if (data["text/plain"]) return this.textBlock(joined(data["text/plain"]), t.foreground);
    return div().text_size(12).text_color(t.dim).child(`[${Object.keys(data).join(", ") || o.output_type}]`);
  }

  cell(c, i, t) {
    const run = c.running ? (c.queued ? "*" : "…") : c.count ?? " ";
    const height = this.rows(c.text) * LINE_H + 14;
    const tools = h_flex().gap(2).items_center()
      .child(this.button(`up-${c.key}`, "↑", t, async cx => this.move(c, -1, cx)).child("↑"))
      .child(this.button(`dn-${c.key}`, "↓", t, async cx => this.move(c, 1, cx)).child("↓"))
      .child(this.button(`rm-${c.key}`, "Delete", t, async cx => this.remove(c, cx)).child("Delete"));
    if (c.type === "markdown" && !c.editing) {
      return v_flex().id(`cell-${c.key}`).gap(4).px(16).py(6).rounded(6).hover(s => s.bg(t.surface))
        .on_mouse_down("left", (e, cx) => { if (e.click_count === 2) { if (!c.code) this.editorFor(c); c.editing = true; this.focused = c; cx.notify(); } })
        .child(h_flex().child(div().flex_1().text_size(11).text_color(t.dim).child("Markdown · double-click to edit")).child(tools))
        .child(c.text.trim() ? TextView.markdown(`md-${c.key}`, c.text) : div().text_color(t.dim).child("Empty markdown cell"));
    }
    return v_flex().id(`cell-${c.key}`).gap(6).px(16).py(6)
      .child(h_flex().gap(8).items_center()
        .child(c.type === "code"
          ? this.button(`run-${c.key}`, "Run", t, async cx => this.run(c, cx), c.running ? t.accent : t.ansi10).child(c.running ? "● Running" : "▶ Run")
          : div().text_size(11).text_color(t.dim).child("Markdown"))
        .child(div().font_family(this.font).text_size(12).text_color(t.dim).child(c.type === "code" ? `[${run}]` : ""))
        .child(div().flex_1()).child(tools))
      .child(this.active === c && c.code
        ? div().h(height).rounded(6).border_1().border_color(t.accent).bg(t.surface).p(6).child(Editor.new(c.code).size_full())
        : div().rounded(6).border_1().border_color(t.border).bg(t.surface).p(6).hover(s => s.border_color(t.dim)).child(this.staticCode(c, t)))
      .when(c.type === "code" && c.outputs.length > 0, el => el.child(v_flex().gap(6).pl(8).py(4).border_l(2).border_color(t.border)
        .children(c.outputs.map(o => this.output(o, t)))));
  }

  render(t) {
    const k = this.kernel;
    const kcolor = k.state === "idle" ? t.ansi10 : k.state === "busy" || k.state === "starting" ? t.ansi11 : k.state === "dead" ? t.ansi9 : t.dim;
    const kname = k.python ? k.python.replace(/^.*\/(.+)\/\.venv\/bin\/python$/, "$1 (.venv)") : "";
    return v_flex().id("notebook").size_full().min_h(0).bg(t.background)
      .on_size_change((size, cx) => { if (Math.abs((this.width ?? 0) - size.width) > 4) { this.width = size.width; cx.notify(); } })
      .child(h_flex().h(34).flex_none().px(10).gap(2).items_center().border_b(1).border_color(t.border)
        .child(this.button("nb-runall", "Run All", t, cx => this.runAll(cx), t.ansi10).child("▶▶ Run All"))
        .child(this.button("nb-int", "Interrupt", t, () => this.interrupt()).child("■ Interrupt"))
        .child(this.button("nb-restart", "Restart", t, cx => this.restart(cx)).child("↻ Restart"))
        .child(this.button("nb-clear", "Clear", t, async cx => this.clearOutputs(cx)).child("Clear Outputs"))
        .child(div().w(10))
        .child(this.button("nb-code", "+ Code", t, async cx => this.add("code", cx)).child("+ Code"))
        .child(this.button("nb-md", "+ Markdown", t, async cx => this.add("markdown", cx)).child("+ Markdown"))
        .child(div().flex_1())
        .child(h_flex().gap(6).items_center().text_size(12).text_color(t.muted)
          .child(div().size(8).rounded(4).bg(kcolor))
          .child(div().child(k.state === "off" ? "Kernel starts on first run" : `${kname || "Python"} · ${k.state}`))))
      .when(Boolean(k.error), el => el.child(div().px(14).py(6).text_size(12).text_color(t.ansi9)
        .child(/ipykernel/.test(k.error) ? `${k.error}. Install it in the project, e.g. \`uv add --dev ipykernel\`.` : k.error)))
      .child(v_flex().id("cells").flex_1().min_h(0).overflow_y_scrollbar().py(8).gap(4)
        .children(this.cells.map((c, i) => this.cell(c, i, t)))
        .child(h_flex().px(16).py(10).gap(8)
          .child(this.button("nb-code2", "+ Code", t, async cx => { this.focused = null; this.add("code", cx); }).child("+ Code"))
          .child(this.button("nb-md2", "+ Markdown", t, async cx => { this.focused = null; this.add("markdown", cx); }).child("+ Markdown"))));
  }
}
