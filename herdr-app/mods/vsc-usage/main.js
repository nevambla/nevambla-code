// Dropdown under the title bar's Claude usage: every configured account
// with its session and week limits. Click one to show it in the title bar.
// vsc-titlebar passes the accounts (from its layout props) as props().accounts
// and the data through shared "vsc.usage".
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, shared, setShared, props, closeOverlay } from "herdr";

export const CLAUDE = "#d97757";
const accounts = () => props()?.accounts?.length ? props().accounts : [{ id: "claude", name: "Claude", cmd: "claude" }];

function until(iso) {
  const m = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000));
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m`;
}
const hhmm = ms => { const d = new Date(ms), p = n => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}`; };

export default class VscUsage extends View {
  init(_p, cx) { cx.timer.every(30000, cx => cx.notify()); }

  // However it closes (pointer left, click beside it, Esc), tell the title bar so it can reopen it.
  async close() { setShared("vsc.usage.hover", false); setShared("vsc.usage.closedAt", Date.now()); }

  meter(label, w, t) {
    const left = Math.max(0, Math.min(100, Math.round(100 - (w?.utilization ?? 0))));
    return h_flex().gap(8).items_center()
      .child(div().w(52).text_color(t.dim).child(label))
      .child(div().w(90).h(5).rounded(3).bg(t.border).overflow_hidden().child(div().h_full().w(Math.round(90 * left / 100)).bg(CLAUDE)))
      .child(div().w(34).text_right().text_color(t.foreground).child(`${left}%`))
      .child(div().text_color(t.dim).child(w?.resets_at ? `resets in ${until(w.resets_at)}` : ""));
  }

  account({ id, name, cmd }, data, shown, t) {
    const d = data?.[id], on = shown === id;
    return v_flex().id(`acc-${id}`).gap(6).p(10).rounded(6).cursor_pointer()
      .bg(on ? t.selected : t.popover).hover(s => s.bg(on ? t.selected : t.hover))
      .on_click(() => { setShared("vsc.usage.shown", id); closeOverlay(props().overlay); })
      .child(h_flex().gap(8).items_center()
        .child(div().font_semibold().text_color(CLAUDE).child(name))
        .child(div().text_color(t.dim).child(cmd))
        .child(div().flex_1())
        .when(on, el => el.child(div().text_size(10).text_color(t.muted).child("IN TITLE BAR"))))
      .when(Boolean(d?.five_hour), el => el
        .child(this.meter("Session", d.five_hour, t))
        .child(this.meter("Week", d.seven_day, t)))
      .when(Boolean(d?.stale), el => el.child(div().text_size(11).text_color(t.dim)
        .child(`As of ${hhmm(d.at)}. Open ${cmd} to refresh.`)))
      .when(!d?.five_hour, el => el.child(div().text_size(11).text_color(t.dim)
        .child(`No data yet. Open ${cmd} once so its login renews.`)));
  }

  render() {
    const t = theme(), data = shared("vsc.usage"), accs = accounts();
    const shown = accs.find(a => a.id === shared("vsc.usage.shown"))?.id ?? accs[0].id;
    return v_flex().id("usage-pop").w_full().p(6).gap(4).bg(t.popover).border_1().border_color(t.border).rounded(8)
      .text_size(12).text_color(t.foreground)
      .on_hover((h) => { setShared("vsc.usage.hover", h); if (!h) closeOverlay(props().overlay); })
      .children(accs.map(a => this.account(a, data, shown, t)));
  }
}
