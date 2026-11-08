// PDFs in vsc-editor: every page rendered to a PNG by poppler's pdftoppm (in the background,
// so big files don't hit exec's 30 s limit) and shown one under another, fitted to the width.
// Memory: pages are 1200 px wide, only the pages on screen are drawn (a virtual list), and the
// shown width moves in 100 px steps, so resizing doesn't decode every page at every size.
// Pages are cached in data/vsc-editor/pdf/<hash of path + modified time>/ (outside the mod folder: no reload, never shared).
import { div, image } from "gpui-kit";
import { v_flex, h_flex, v_virtual_list, Scrollbar } from "gpui-base";
import { exec, appHome } from "herdr";

const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(16); };

export class Pdf {
  constructor(file) { this.file = file; this.pages = 0; this.ready = []; this.zoom = 1; this.ratio = 842 / 595; }

  async load() {
    const p = this.file.path;
    const info = await exec("pdfinfo", [p]).catch(() => null);
    if (!info || info.code !== 0) {
      throw new Error(info ? (info.stderr.trim() || "pdfinfo failed") : "poppler is not installed (brew install poppler)");
    }
    this.pages = Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
    const size = info.stdout.match(/^Page size:\s+([\d.]+) x ([\d.]+)/m);
    if (size) this.ratio = Number(size[2]) / Number(size[1]);
    this.title = info.stdout.match(/^Title:\s+(.+)$/m)?.[1]?.trim();
    const mtime = (await exec("stat", ["-f", "%m", p])).stdout.trim();
    const root = `${appHome()}/data/vsc-editor/pdf`;
    this.dir = `${root}/${hash(p + mtime + "@1200")}`;
    // Rendered pages are reused; caches untouched for a week are deleted.
    await exec("sh", ["-c", 'find "$2" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} + 2>/dev/null; [ -f "$1/done" ] && touch "$1" || { mkdir -p "$1"; nohup sh -c \'pdftoppm -png -scale-to-x 1200 -scale-to-y -1 "$2" "$1/p" && touch "$1/done"\' render "$1" "$3" > "$1/log" 2>&1 & }',
      "pdf", this.dir, root, p]);
    await this.poll();
  }

  // Which pages exist yet; called on a timer until all are there.
  async poll() {
    if (!this.dir || this.done) return false;
    const r = await exec("sh", ["-c", 'ls "$1" | grep "^p-.*\\.png$" | sort; [ -f "$1/done" ] && echo DONE', "ls", this.dir]).catch(() => null);
    if (!r) return false;
    const names = r.stdout.split("\n").filter(n => n.endsWith(".png"));
    const done = r.stdout.includes("DONE");
    // pdftoppm writes a page while it renders: trust a file only once the next one exists, or at the end.
    const ready = done ? names : names.slice(0, -1);
    const changed = ready.length !== this.ready.length || done !== this.done;
    this.ready = ready; this.done = done;
    return changed;
  }

  button(id, label, t, action) {
    return div().id(id).h(24).px(8).flex().items_center().rounded(4).cursor_pointer().text_size(12).text_color(t.muted)
      .hover(s => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => { action(); cx.notify(); }).child(label);
  }

  render(t) {
    const fit = Math.max(200, (this.width ?? 900) - 48);
    const w = Math.max(200, Math.floor(Math.min(fit * this.zoom, 2400) / 100) * 100), h = Math.round(w * this.ratio);
    const rel = n => `${this.dir.replace(appHome() + "/", "")}/${n}`;
    return v_flex().id("pdf").size_full().min_h(0).bg(t.canvas)
      .on_size_change((size, cx) => { if (Math.abs((this.width ?? 0) - size.width) > 4) { this.width = size.width; cx.notify(); } })
      .child(h_flex().h(34).flex_none().px(10).gap(2).items_center().bg(t.background).border_b(1).border_color(t.border)
        .child(this.button("pdf-out", "−", t, () => { this.zoom = Math.max(0.3, this.zoom / 1.2); }))
        .child(div().w(48).text_center().text_size(12).text_color(t.muted).child(`${Math.round(this.zoom * 100)}%`))
        .child(this.button("pdf-in", "+", t, () => { this.zoom = Math.min(4, this.zoom * 1.2); }))
        .child(this.button("pdf-fit", "Fit width", t, () => { this.zoom = 1; }))
        .child(div().flex_1())
        .child(div().text_size(12).text_color(t.dim).child(
          this.done ? `${this.pages} pages` : `Rendering ${this.ready.length} / ${this.pages || "?"} pages…`))
        .child(this.button("pdf-open", "Open in Preview", t, () => { exec("open", [this.file.path]); })))
      .child(this.pagesView(w, h, rel, t));
  }

  // Only the pages on screen are drawn. The rows carry no handlers (a virtual list's rule).
  pagesView(w, h, rel, t) {
    const count = Math.max(this.pages, this.ready.length), ready = this.ready;
    const page = i => div().w_full().h(h + 16).pt(16).flex().justify_center().child(ready[i]
      ? image(rel(ready[i])).w(w).h(h).flex_none()
      : div().w(w).h(h).flex_none().bg(t.surface).flex().items_center().justify_center().text_color(t.dim).child(`Page ${i + 1}`));
    const pages = v_virtual_list("pdf-list", count, h + 16, i => `p${i}`,
      range => Array.from({ length: range.end - range.start }, (_, k) => page(range.start + k))).size_full();
    const wide = w > (this.width ?? 900) - 24;
    return div().flex_1().min_h(0).relative()
      .child(wide
        ? div().id("pdf-x").size_full().overflow_x_scrollbar().child(div().w(w + 48).h_full().child(pages))
        : pages)
      .child(Scrollbar.vertical("pdf-list").viewport_from_layout().absolute().inset_0());
  }
}
