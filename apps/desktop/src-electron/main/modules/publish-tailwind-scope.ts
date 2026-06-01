import postcss, { list, type Rule } from "postcss";

export const PUBLISH_EDITOR_SCOPE_SELECTOR = '[data-slate-editor="true"]';

const ROOT_LIKE_SELECTORS = new Set([":root", ":host", "html", "body"]);
const KEYFRAMES_AT_RULES = new Set(["keyframes", "-webkit-keyframes"]);

export function scopeRuntimeTailwindCss(
  css: string,
  scopeSelector = PUBLISH_EDITOR_SCOPE_SELECTOR,
): string {
  const trimmed = css.trim();
  if (!trimmed) {
    return "";
  }

  const root = postcss.parse(trimmed);
  root.walkRules((rule) => {
    if (isInsideKeyframes(rule)) {
      return;
    }

    const selectors = list
      .comma(rule.selector)
      .map((selector) => scopeSelectorText(selector, scopeSelector));

    rule.selector = Array.from(new Set(selectors)).join(", ");
  });

  return root.toString();
}

function scopeSelectorText(selector: string, scopeSelector: string): string {
  const trimmed = selector.trim();
  if (!trimmed || trimmed.includes("&")) {
    return selector;
  }
  if (trimmed === scopeSelector || trimmed.startsWith(`${scopeSelector} `)) {
    return trimmed;
  }
  if (ROOT_LIKE_SELECTORS.has(trimmed)) {
    return scopeSelector;
  }
  return `${scopeSelector} ${trimmed}`;
}

function isInsideKeyframes(rule: Rule): boolean {
  let parent: { type?: string; name?: string; parent?: unknown } | undefined =
    rule.parent;
  while (parent) {
    if (
      parent.type === "atrule" &&
      typeof parent.name === "string" &&
      KEYFRAMES_AT_RULES.has(parent.name.toLowerCase())
    ) {
      return true;
    }
    parent = parent.parent as typeof parent;
  }
  return false;
}
