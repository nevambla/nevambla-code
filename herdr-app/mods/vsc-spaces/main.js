// Spaces list above the Agents list: one row per space, click to switch,
// + to make a new one. Colors are the ones picked in Herdr's Spaces list.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, spaces, shared } from "herdr";
import { toggleSection, isCollapsed, HEADER_H } from "./sections.js";

const ATTN = { blocked: "blocked", done: "done" };

export default class VscSpaces extends View {
  row(s, t, colors) {
    const c = t[colors[s.id]] ?? t.muted;
    return h_flex().id(`sp-${s.id}`).h(26).flex_none().mx(6).px(8).gap(8).items_center().rounded(5).cursor_pointer()
      .bg(s.active ? t.selected : t.chrome).text_color(s.active ? t.foreground : t.muted)
      .hover(st => st.bg(s.active ? t.selected : t.hover).text_color(t.foreground))
      .on_click(() => run("space.select", { id: s.id }))
      .child(div().size(16).flex_none().rounded(4).bg(c).text_color(t.chrome).text_size(10).font_semibold()
        .flex().items_center().justify_center().child((s.name[0] ?? "?").toUpperCase()))
      .child(div().flex_1().min_w(0).truncate().child(s.name))
      .when(Boolean(s.branch), el => el.child(div().flex_none().max_w(90).truncate().text_size(11).text_color(t.dim).child(s.branch)))
      .when(Boolean(ATTN[s.status]), el => el.child(div().size(6).flex_none().rounded(3).bg(t[ATTN[s.status]])));
  }

  render() {
    const t = theme(), colors = shared("space.colors") ?? {};
    return v_flex().id("vsc-spaces").size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(HEADER_H).flex_none().pl(16).pr(10).items_center().text_color(t.muted)
        .child(h_flex().id("sp-toggle").flex_1().h_full().gap(6).items_center().cursor_pointer().hover(st => st.text_color(t.foreground))
          .on_click(() => toggleSection("spaces"))
          .child(div().child("Spaces")))
        .child(div().id("sp-new").size(22).flex().items_center().justify_center().rounded(5).cursor_pointer()
          .hover(st => st.bg(t.hover).text_color(t.foreground))
          .on_click(() => run("space.new"))
          .child(svg("mods/vsc-spaces/plus.svg").size(13))))
      .when(!isCollapsed("spaces"), el => el.child(v_flex().id("sp-list").flex_1().min_h(0).gap(2).pb(6).overflow_y_scrollbar()
        .children(spaces().map(s => this.row(s, t, colors)))));
  }
}
