import postcss, { list } from "postcss";

export function scopeContentCss(css: string, scope: string): string {
  const root = postcss.parse(css);
  const keyframes = new Map<string, string>();
  const suffix = scope.replace(/[^a-z0-9]/gi, "");
  root.walkAtRules(/^(?:-webkit-)?keyframes$/, rule => {
    const name = rule.params.trim();
    keyframes.set(name, `${name}-${suffix}`);
    rule.params = keyframes.get(name)!;
  });
  root.walkDecls(/^(?:-webkit-)?animation(?:-name)?$/, declaration => {
    declaration.value = declaration.value.replace(
      /[a-zA-Z_][\w-]*/g,
      name => keyframes.get(name) ?? name
    );
  });
  root.walkRules(rule => {
    if (rule.selector.includes("&")) return;
    let parent: { type: string; name?: string; parent?: unknown } | undefined = rule.parent;
    while (parent) {
      if (parent.type === "atrule" && /keyframes$/i.test(parent.name ?? "")) return;
      parent = parent.parent as typeof parent;
    }
    rule.selector = list
      .comma(rule.selector)
      .map(selector => {
        const local = selector.trim().replace(/^(?::root|:host|html|body)(?=$|\s|[.#[:>])\s*/, "");
        return local ? `${scope} ${local}` : scope;
      })
      .join(", ");
  });
  return root.toString();
}
