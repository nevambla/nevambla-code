// Collapsible Spaces / Agents sections at the bottom of the side bar (nevambla-code layout).
// Click a section's title to collapse it to one row; click again to bring it back at the
// size it had. Both collapsed, the whole dock shrinks to the two rows and the Explorer gets
// the room. State: shared "vsc.sections" = {spaces, agents, sizes: {id: size}}.
import { shared, setShared, run, layout } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = find(c, id); if (f) return f; }
  return null;
}

export const HEADER_H = 32;
const NODE = { spaces: "spaces-switch", agents: "agents-list" };
const DEFAULT = { "spaces-switch": { weight: 1 }, "agents-list": { weight: 2 }, "agents-dock": { weight: 1 } };
export const isCollapsed = which => Boolean(shared("vsc.sections")?.[which]);

const resize = (id, size) => run("layout.resize", { id, ...(size?.px != null ? { px: size.px } : { weight: size?.weight ?? 1 }) });

export function toggleSection(which) {
  const L = layout(), c = { ...(shared("vsc.sections") ?? {}) }, sizes = { ...(c.sizes ?? {}) };
  const other = which === "spaces" ? "agents" : "spaces";
  if (!c[which]) {
    // Collapsing: remember this section's size (and the dock's, if both end up collapsed).
    sizes[NODE[which]] = find(L, NODE[which])?.size ?? DEFAULT[NODE[which]];
    if (c[other]) sizes["agents-dock"] = find(L, "agents-dock")?.size ?? DEFAULT["agents-dock"];
    c[which] = true;
    resize(NODE[which], { px: HEADER_H });
    if (c[other]) resize("agents-dock", { px: HEADER_H * 2 + 1 });
  } else {
    // Expanding: back to the remembered sizes.
    if (c[other]) resize("agents-dock", sizes["agents-dock"] ?? DEFAULT["agents-dock"]);
    resize(NODE[which], sizes[NODE[which]] ?? DEFAULT[NODE[which]]);
    c[which] = false;
  }
  setShared("vsc.sections", { ...c, sizes });
}
