import template from "@/assets/ppt/template-cinematic.html?raw";

const layouts = [
  "cover",
  "agenda",
  "chapter",
  "definition",
  "cards",
  "statistics",
  "statement",
  "chapter-two",
  "compare",
  "chart",
  "steps",
  "detail",
  "timeline",
  "matrix",
  "quote",
  "summary",
  "profiles",
  "end",
];

// 此源模板和页型顺序共同构成 cinematic-v1，发布新外壳时应分配新版本。
const examples = [...template.matchAll(/<section class="slide\b[\s\S]*?<\/section>/g)];
const css = template.match(/<style>([\s\S]*?)<\/style>/)?.[1];
if (examples.length !== layouts.length || !css) throw new Error("电影模板的页型或样式不完整");

export const cinematicFiles: Record<string, string> = {
  "template/layouts.md": layouts.map(name => `template/examples/${name}.html`).join("\n"),
  "template/theme.css": css,
  "template/shell.html":
    template
      .slice(0, template.lastIndexOf("<!--", examples[0].index))
      .replace(/<link\b[^>]*>/g, "")
      .replace(/<title>[^<]*<\/title>/, "<title>{{title}}</title>")
      .replace(/<style>[^]*?<\/style>/, "<style>{{theme}}</style>") +
    "{{slides}}\n</body>\n</html>",
};
for (const [index, name] of layouts.entries()) {
  cinematicFiles[`template/examples/${name}.html`] = examples[index][0].replace(
    "slide-hero active",
    "slide-hero"
  );
}
