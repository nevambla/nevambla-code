// File-type icons from the Nerd Font (same glyphs and colors as nvim-web-devicons).
export const ICON_FONT = "JetBrainsMono Nerd Font";

const EXT = {
  py: ["", "#ffbc03"], pyi: ["", "#ffbc03"], ipynb: ["", "#f57d01"],
  md: ["", "#519aba"], mdx: ["", "#519aba"], txt: ["", "#89e051"], pdf: ["", "#e44d26"],
  c: ["", "#599eff"], h: ["", "#a074c4"], cpp: ["", "#519aba"], cc: ["", "#519aba"], hpp: ["", "#a074c4"],
  js: ["", "#cbcb41"], mjs: ["", "#cbcb41"], cjs: ["", "#cbcb41"], ts: ["", "#519aba"],
  jsx: ["", "#20c2e3"], tsx: ["", "#1354bf"], json: ["", "#cbcb41"], jsonc: ["", "#cbcb41"],
  html: ["", "#e44d26"], htm: ["", "#e44d26"], css: ["", "#42a5f5"], scss: ["", "#f55385"],
  sh: ["", "#89e051"], zsh: ["", "#89e051"], bash: ["", "#89e051"], fish: ["", "#89e051"],
  rs: ["", "#dea584"], go: ["", "#00add8"], lua: ["", "#51a0cf"], java: ["", "#cc3e44"],
  rb: ["", "#cc3e44"], php: ["", "#a074c4"], swift: ["", "#e37933"], kt: ["", "#7f52ff"],
  toml: ["", "#9c4221"], yml: ["", "#6d8086"], yaml: ["", "#6d8086"], xml: ["\uf121", "#e37933"],
  csv: ["", "#89e051"], xlsx: ["", "#207245"], sql: ["", "#dad8d8"], db: ["", "#dad8d8"], sqlite: ["", "#dad8d8"],
  png: ["", "#a074c4"], jpg: ["", "#a074c4"], jpeg: ["", "#a074c4"], gif: ["", "#a074c4"],
  webp: ["", "#a074c4"], svg: ["", "#ffb13b"], ico: ["", "#cbcb41"],
  mp4: ["", "#fd971f"], mov: ["", "#fd971f"], mp3: ["", "#ee82ee"], wav: ["", "#ee82ee"],
  zip: ["", "#eca517"], gz: ["", "#eca517"], tar: ["", "#eca517"],
  lock: ["", "#bbbbbb"], env: ["", "#faf743"], tex: ["", "#3d6117"], sol: ["", "#519aba"],
  astro: ["", "#e23f67"], vue: ["", "#8dc149"], svelte: ["", "#ff3e00"],
};
const NAME = {
  dockerfile: ["", "#458ee6"], makefile: ["", "#6d8086"], license: ["", "#d0bf41"],
  ".gitignore": ["", "#f54d27"], ".gitattributes": ["", "#f54d27"], ".gitmodules": ["", "#f54d27"],
  ".env": ["", "#faf743"], "package.json": ["", "#e8274b"], "claude.md": ["", "#d97757"],
};
const DEFAULT = ["", "#6d8086"];

export function fileIcon(name) {
  const n = name.toLowerCase();
  if (NAME[n]) return NAME[n];
  if (n.startsWith(".env")) return NAME[".env"];
  const ext = n.includes(".") ? n.split(".").pop() : "";
  return EXT[ext] ?? DEFAULT;
}

export const folderIcon = open => [open ? "" : "", "#dcb67a"];
