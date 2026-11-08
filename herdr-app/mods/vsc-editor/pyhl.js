// A small Python highlighter for notebook cells you aren't editing: static text
// doesn't catch the mouse wheel, so scrolling over it scrolls the notebook.
// Same token colors as the code editor (the `syntax` map passed in).
const KEYWORDS = new Set(("and as assert async await break class continue def del elif else except finally for from global " +
  "if import in is lambda match case nonlocal not or pass raise return try while with yield").split(" "));
const CONSTANTS = new Set(["True", "False", "None"]);
const TOKEN = /(#.*$)|([rRbBuUfF]{0,2}("""|'''|"|')(?:\\.|(?!\3).)*\3)|(\b\d[\d_]*\.?[\d_]*(?:e[+-]?\d+)?j?\b)|(@[A-Za-z_][\w.]*)|([A-Za-z_]\w*)|(\s+)|([^\w\s])/g;

// Returns lines of [text, colorKey] pieces; `state` carries open triple-quoted strings.
export function highlight(code) {
  const out = [];
  let open = null;  // the triple quote we're inside, if any
  for (const line of code.split("\n")) {
    const pieces = [];
    let rest = line;
    if (open) {
      const end = rest.indexOf(open);
      if (end < 0) { out.push([[rest, "string"]]); continue; }
      pieces.push([rest.slice(0, end + 3), "string"]); rest = rest.slice(end + 3); open = null;
    }
    let prev = "";
    TOKEN.lastIndex = 0;
    for (let m; (m = TOKEN.exec(rest)); ) {
      const [tok, comment, str, , num, deco, ident, space] = m;
      let kind = "text";
      if (comment) kind = "comment";
      else if (str) kind = "string";
      else if (num) kind = "number";
      else if (deco) kind = "function";
      else if (ident) {
        const next = rest.slice(TOKEN.lastIndex).trimStart()[0];
        kind = KEYWORDS.has(ident) ? "keyword" : CONSTANTS.has(ident) ? "boolean"
          : prev === "def" || next === "(" ? "function" : prev === "class" ? "type" : "text";
        prev = ident;
      } else if (space) kind = "space";
      else kind = "operator";
      pieces.push([tok, kind]);
    }
    // An unterminated triple quote opens a multi-line string.
    const tq = rest.match(/[rRbBuUfF]{0,2}("""|''')(?!.*\1)/);
    if (tq && !/(#.*$)/.test(rest.slice(0, tq.index)) && pieces.every(p => p[1] !== "string" || !p[0].includes(tq[1]) || p[0].lastIndexOf(tq[1]) === 0)) {
      const at = rest.indexOf(tq[0]);
      const before = pieces.reduce((acc, p) => { if (acc.len < at) { acc.keep.push(p); acc.len += p[0].length; } return acc; }, { keep: [], len: 0 }).keep;
      out.push([...before, [rest.slice(at), "string"]]); open = tq[1]; continue;
    }
    out.push(pieces);
  }
  return out;
}
