// VS Code-style panel header above the terminals: TERMINAL on the left, the
// space's tabs on the right (click to switch), then new tab, split and maximize.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, run, spaces, layout, nextCommand } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = find(c, id); if (f) return f; }
  return null;
}
const DOT = { working: "working", blocked: "blocked", done: "done" };

// The editor and the terminals share "work": a column puts the panel at the
// bottom, a row puts it on the right. Flipping rewrites this personal layout.
const onRight = () => find(layout(), "work")?.type === "row";
function flip() {
  const tree = JSON.parse(JSON.stringify(layout())), work = find(tree, "work");
  if (!work) return;
  work.type = work.type === "row" ? "column" : "row";
  run("layout.set", { layout: tree });
  run(work.type === "row" ? "vsc-editor.wrap" : "vsc-editor.nowrap");
}

export default class VscPanelbar extends View {
  init(_p, cx) {
    cx.spawn(async cx => { for (;;) { if (await nextCommand() === "flip") flip(); cx.notify(); } });
  }

  icon(id, file, title, action) {
    const t = theme();
    return div().id(id).size(22).flex_none().flex().items_center().justify_center().rounded(5).cursor_pointer()
      .text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).on_click(action)
      .child(svg(`mods/vsc-panelbar/${file}.svg`).size(14));
  }

  render() {
    const t = theme(), space = spaces().find(s => s.active);
    const tabs = (space?.tabs ?? []).filter(x => !x.settled || x.active);
    const maximized = find(layout(), "editor")?.hidden;
    return h_flex().id("panelbar").size_full().px(12).gap(14).items_center().bg(t.chrome).text_size(11)
      .child(h_flex().h_full().items_center().relative().text_color(t.foreground)
        .child(div().child("TERMINAL"))
        .child(div().absolute().left(0).right(0).bottom(5).h(1).bg(t.accent)))
      .child(div().flex_1())
      .child(h_flex().id("ptabs").gap(10).items_center().overflow_x_scroll().text_size(12)
        .children(tabs.map(x => h_flex().id(`pt-${x.id}`).gap(5).items_center().cursor_pointer().relative().h(30)
          .text_color(x.active ? t.foreground : t.muted).hover(s => s.text_color(t.foreground))
          .on_click(() => run("tab.select", { id: x.id }))
          // Double-click renames, like Herdr's own tab bar (F2 renames the shown tab).
          .on_mouse_down("left", (e) => { if (e.click_count === 2) run("tab.rename", { id: x.id }); })
          .when(Boolean(DOT[x.status]), el => el.child(div().size(6).rounded(3).bg(t[DOT[x.status]])))
          .child(div().child(x.name))
          .when(x.active, el => el.child(div().absolute().left(0).right(0).bottom(4).h(1).bg(t.foreground))))))
      .child(h_flex().gap(2).items_center()
        .child(this.icon("p-new", "plus", "New terminal", () => run("tab.new")))
        .child(this.icon("p-split", "split", "Split", () => run("pane.split", { direction: onRight() ? "down" : "right" })))
        .child(this.icon("p-pos", onRight() ? "panel-bottom" : "panel-right", "Move panel", () => flip()))
        .child(this.icon("p-max", maximized ? "chevron-down" : "chevron-up", "Maximize", () => run("layout.toggle", { id: "editor" }))));
  }
}
