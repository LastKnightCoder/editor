/**
 * 代码高亮配色：只引用 --tau-* 语义色，深浅主题随 data-theme 自动切换，
 * 不再按 isDark 加载 oneLight / oneDark 两套（D-048）。
 * 色彩只表意：关键字 accent、字符串 ok、数字 / 常量 warn、函数 info、类型 tag-3、注释 ink-3。
 */

import type { CSSProperties } from "react";

const base: CSSProperties = {
  color: "var(--tau-ink-1)",
  background: "transparent",
  fontFamily: "var(--tau-font-mono)",
  fontSize: "12.5px",
  lineHeight: 1.7,
  textShadow: "none",
  whiteSpace: "pre",
  wordSpacing: "normal",
  wordBreak: "normal",
  tabSize: 2,
  hyphens: "none",
};

export const tauPrismTheme: Record<string, CSSProperties> = {
  'code[class*="language-"]': base,
  'pre[class*="language-"]': { ...base, margin: 0, padding: 0, overflow: "auto" },
  comment: { color: "var(--tau-ink-3)", fontStyle: "italic" },
  prolog: { color: "var(--tau-ink-3)" },
  doctype: { color: "var(--tau-ink-3)" },
  cdata: { color: "var(--tau-ink-3)" },
  punctuation: { color: "var(--tau-ink-2)" },
  namespace: { opacity: 0.75 },
  property: { color: "var(--tau-info)" },
  tag: { color: "var(--tau-accent-text)" },
  boolean: { color: "var(--tau-warn)" },
  number: { color: "var(--tau-warn)" },
  constant: { color: "var(--tau-warn)" },
  symbol: { color: "var(--tau-warn)" },
  deleted: { color: "var(--tau-danger)" },
  selector: { color: "var(--tau-ok)" },
  "attr-name": { color: "var(--tau-warn)" },
  string: { color: "var(--tau-ok)" },
  char: { color: "var(--tau-ok)" },
  builtin: { color: "var(--tau-tag-3)" },
  inserted: { color: "var(--tau-ok)" },
  operator: { color: "var(--tau-ink-2)" },
  entity: { color: "var(--tau-ink-2)" },
  url: { color: "var(--tau-info)" },
  atrule: { color: "var(--tau-accent-text)" },
  "attr-value": { color: "var(--tau-ok)" },
  keyword: { color: "var(--tau-accent-text)" },
  function: { color: "var(--tau-info)" },
  "class-name": { color: "var(--tau-tag-3)" },
  regex: { color: "var(--tau-tag-5)" },
  important: { color: "var(--tau-danger)", fontWeight: 600 },
  variable: { color: "var(--tau-ink-1)" },
  bold: { fontWeight: 600 },
  italic: { fontStyle: "italic" },
};
