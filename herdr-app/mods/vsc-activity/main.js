// VS Code-style activity bar: picks what the side bar shows; clicking the
// shown one again hides the side bar.
import { View, div, svg } from "gpui-kit";
import { v_flex } from "gpui-base";
import { theme, run, layout, agents } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = find(c, id); if (f) return f; }
  return null;
}

const VIEWS = [
  { id: "explorer", icon: "files", title: "Explorer" },
  { id: "changes", icon: "git-branch", title: "Source Control" },
  { id: "spaces", icon: "layers", title: "Spaces" },
];

function pick(view) {
  const L = layout(), side = find(L, "side"), body = find(L, "side-body");
  if (!side?.hidden && body?.active === view) { run("layout.hide", { id: "side" }); return; }
  run("layout.select", { stack: "side-body", child: view });
  run("layout.show", { id: "side" });
}

export default class VscActivity extends View {
  item(v, active, badge) {
    const t = theme();
    return div().id(`act-${v.id}`).relative().w_full().h(48).flex().items_center().justify_center().cursor_pointer()
      .text_color(active ? t.foreground : t.dim).hover(s => s.text_color(t.foreground))
      .on_click(() => pick(v.id))
      .when(active, el => el.child(div().absolute().left(0).top(0).bottom(0).w(2).bg(t.accent)))
      .child(svg(`mods/vsc-activity/${v.icon}.svg`).size(22))
      .when(badge > 0, el => el.child(div().absolute().right(8).bottom(10).min_w(16).h(16).px(4).rounded(8)
        .bg(t.accent).text_color(t.accent_foreground).text_size(10).font_semibold()
        .flex().items_center().justify_center().child(String(badge))));
  }

  render() {
    const t = theme(), L = layout();
    const shown = find(L, "side")?.hidden ? null : find(L, "side-body")?.active;
    const waiting = agents().filter(a => a.status === "blocked" || a.status === "done").length;
    return v_flex().id("activity").size_full().bg(t.chrome).border_r(1).border_color(t.border)
      .children(VIEWS.map(v => this.item(v, shown === v.id, 0)))
      .child(div().flex_1())
      .child(div().id("act-settings").w_full().h(48).flex().items_center().justify_center().cursor_pointer()
        .text_color(t.dim).hover(s => s.text_color(t.foreground)).on_click(() => run("app.settings"))
        .child(svg("mods/vsc-activity/settings.svg").size(22)));
  }
}
