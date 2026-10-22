/**
 * WeChat Official Account compatible CSS styles
 * Strictly based on editor extensions styles from packages/editor/src/extensions/
 */

import {
  INLINE_PALETTE,
  exportHighlightColors,
} from "@tau/editor/extensions/text-formatting/palette";

/** 高亮 / 下划线色取编辑器统一行内色板（导出为浅色版） */
const inlinePaletteHighlightStyles = INLINE_PALETTE.map(({ id }) => {
  const colors = exportHighlightColors(id)!;
  return `.highlight-${id} { background: ${colors.background}; border-bottom: 2px solid ${colors.line}; }`;
}).join("\n");

const inlinePaletteUnderlineStyles = INLINE_PALETTE.map(
  ({ id, light }) =>
    `.underline.underline-${id} { border-bottom-color: ${light}; }\n` +
    `.underline-wavy.underline-${id} { text-decoration-color: ${light}; }`
).join("\n");

// Callout icons as inline SVG data URIs
const CALLOUT_ICONS = {
  tip: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23009400'%3E%3Cpath d='M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6A4.997 4.997 0 0 1 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z'/%3E%3C/svg%3E`,
  info: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%234cb3d4'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z'/%3E%3C/svg%3E`,
  warning: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23e6a700'%3E%3Cpath d='M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z'/%3E%3C/svg%3E`,
  danger: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23e13238'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z'/%3E%3C/svg%3E`,
  note: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23666666'%3E%3Cpath d='M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z'/%3E%3C/svg%3E`,
};

export { CALLOUT_ICONS };

export const wechatBaseStyles = `
/* ========== Base Reset ========== */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  font-family: Optima, 'Microsoft YaHei', PingFangSC-regular, serif;
}

.wechat-content {
  padding-left: 1em;
  padding-right: 1em;
}

/* 代码块内的元素使用等宽字体 */
.code-block,
.code-block * {
  font-family: Consolas, Monaco, Menlo, monospace !important;
}

.shiki,
.shiki *,
.hljs,
.hljs * {
  font-family: Consolas, Monaco, Menlo, monospace !important;
}

/* ========== Paragraph (from paragraph/components/Paragraph) ========== */
.paragraph {
  margin-bottom: 1.25em;
  line-height: 1.8;
  font-size: 16px;
  color: #333;
  font-family: Optima, 'Microsoft YaHei', PingFangSC-regular, serif;
}

/* ========== Header (from header/components/Header) ========== */
.header {
  font-weight: bold;
  line-height: 1.5;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25em;
}

.header-1 {
  font-size: 2em;
  line-height: 1.3;
  margin-top: 0.75em;
  margin-bottom: 1em;
}

.header-2 {
  font-size: 1.75em;
  margin-top: 0.6em;
  margin-bottom: 0.8em;
}

.header-3 {
  font-size: 1.5em;
  margin-top: 0.5em;
  margin-bottom: 0.6em;
}

.header-4 {
  font-size: 1.25em;
  margin-top: 0.4em;
  margin-bottom: 0.5em;
}

.header-5 {
  font-size: 1.125em;
  margin-top: 0.3em;
  margin-bottom: 0.4em;
}

.header-6 {
  font-size: 1em;
  margin-top: 0.2em;
  margin-bottom: 0.3em;
}

/* ========== Code Block (from code-block/components/CodeBlock) ========== */
.code-block {
  background: rgba(246, 248, 250, 0.9);
  border-radius: 0.5em;
  padding: 0;
  margin: 1em 0;
  overflow-x: auto;
  font-family: Consolas, Monaco, Menlo, monospace;
  font-size: 0.875em;
  line-height: 1.6;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);
}

.code-block code {
  background: transparent;
  padding: 1.25em 1.25em;
  font-family: Consolas, Monaco, Menlo, monospace;
  font-size: inherit;
  word-break: normal;
  display: block;
  white-space: nowrap;
  overflow-x: auto;
}

.shiki {
  margin: 1em 0;
  border-radius: 0.5em;
  font-size: 0.875em;
  line-height: 1.6;
  overflow-x: auto;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.1);
}

.shiki code {
  display: block;
  padding: 1.25em 1.25em;
  white-space: nowrap;
}

.shiki .line {
  display: block;
}

.shiki .line:empty {
  min-height: 1.6em;
}

.hljs {
  color: #383a42;
}

/* Inline Code - 中性字色（继承段落 #333）+ 浅灰背景，与编辑器一致 */
.inline-code {
  padding: 0.25em;
  font-family: Consolas, Monaco, Menlo, monospace;
  font-size: 0.9em;
  background: rgba(246, 248, 250, 0.9);
}

/* Keyboard key (light style) */
.kbd {
  display: inline-block;
  padding: 0.15em 0.45em;
  margin: 0 0.1em;
  border: 1px solid #d0d7de;
  border-bottom-width: 2px;
  border-radius: 0.3em;
  background: #f6f8fa;
  color: #1f2328;
  font-family: Consolas, Monaco, Menlo, monospace;
  font-size: 0.85em;
  line-height: 1.2;
  vertical-align: baseline;
  white-space: nowrap;
}

/* ========== Blockquote ========== */
/*
 * 公众号会过滤 position，无法照搬编辑器的左栏定位：降级为文档流版本，
 * 竖线贴左满高、大引号独占首行。juice 不解析 Unicode 转义，content 必须写字面字符。
 */
.blockquote {
  margin: 1em 0;
  padding-left: 1.4em;
  border-left: 2px solid rgba(0, 0, 0, 0.15);
}

.blockquote::before {
  content: "“";
  display: block;
  height: 0.55em;
  font-size: 2.9em;
  line-height: 1;
  font-family: Georgia, 'Times New Roman', serif;
  color: rgba(30, 107, 184, 0.55);
}

/* juice 内联时简写与长属性各自保留、简写可能排在后面，这里只写长属性 */
.blockquote .blockquote {
  margin-top: 0.5em;
  margin-bottom: 0.5em;
  padding-left: 1.1em;
}

/* juice 对 content: none 仍会生成空 span，需一并隐藏 */
.blockquote .blockquote::before {
  content: none;
  display: none;
}

.blockquote .blockquote .paragraph {
  color: #6a737d;
}

/* 嵌套规则里的 margin-bottom 优先级更高，需单独选中内层末位 */
.blockquote > :last-child,
.blockquote .blockquote:last-child {
  margin-bottom: 0;
}

/* ========== Image (from image/components/Image) ========== */
.image-container {
  display: block;
  width: fit-content;
  max-width: 100%;
  margin: 1em auto;
  text-align: center;
}

.image {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

/* ========== Bulleted List (from bulleted-list/components/BulletedList) ========== */
.bulleted-list {
  margin: 0.5em 0;
  padding-inline-start: 2.5em;
  list-style-type: disc;
}

.bulleted-list .list-item {
  margin-bottom: 0.5em;
  position: relative;
  line-height: 1.8;
}

/* ========== Numbered List (from numbered-list/components/NumberedList) ========== */
.numbered-list {
  margin: 0.5em 0;
  padding-inline-start: 2.5em;
  counter-reset: item;
  list-style-type: decimal;
}

.numbered-list .list-item {
  margin-bottom: 0.5em;
  line-height: 1.8;
}

/* ========== List Item (from list-item/components/ListItem) ========== */
.list-item {
  position: relative;
}

.list-icon {
  margin-right: 0.5em;
  font-size: 1.1em;
}

.list-icon-image {
  width: 18px;
  height: 18px;
  vertical-align: middle;
  margin-right: 0.5em;
  border-radius: 4px;
}

/* ========== Check List (from check-list/components/CheckListItem) ========== */
.check-list {
  list-style: none;
  padding-left: 0;
  margin: 0.5em 0;
}

.check-list-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5em;
  margin: 0.25em 0;
  line-height: 1.8;
}

.checkbox {
  width: 16px;
  height: 16px;
  border: 2px solid #d9d9d9;
  border-radius: 3px;
  margin-top: 6px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.checkbox.checked {
  background: #1890ff;
  border-color: #1890ff;
  color: white;
}

.checkbox.checked::after {
  content: "✓";
  font-size: 10px;
  color: white;
}

.check-list-item.checked .content {
  color: #999;
  text-decoration: line-through;
}

/* ========== Table (from table/components/Table) ========== */
.table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  font-size: 14px;
}

.table-row:first-child .table-cell {
  background: #f5f7f9;
  font-weight: bold;
}

.table-cell {
  border: 1px solid #e1e4e8;
  padding: 0.75em 1em;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  word-break: break-word;
}

/* ========== Callout (from callout/components/callout) ========== */
.callout {
  border-radius: 6px;
  padding: 1em;
  margin: 1em 0;
  border-left: 4px solid;
}

.callout-tip {
  background: #e6ffe6;
  border-color: #009400;
}

.callout-tip .callout-title {
  color: #003100;
}

.callout-info {
  background: #eef9fd;
  border-color: #4cb3d4;
}

.callout-info .callout-title {
  color: #193c47;
}

.callout-warning {
  background: #fff8e6;
  border-color: #e6a700;
}

.callout-warning .callout-title {
  color: #4d3800;
}

.callout-danger {
  background: #ffebec;
  border-color: #e13238;
}

.callout-danger .callout-title {
  color: #4b1113;
}

.callout-note {
  background: #fdfdfe;
  border-color: #d4d5d8;
}

.callout-note .callout-title {
  color: #474748;
}

.callout-title {
  font-weight: bold;
  margin-bottom: 0.5em;
  line-height: 1.4;
}

.callout-icon {
  width: 1.2em;
  height: 1.2em;
  vertical-align: middle;
  margin-right: 0.4em;
}

.callout-content {
  line-height: 1.6;
}

.callout p:last-child {
  margin-bottom: 0;
}

/* ========== Detail (from detail/components/Detail) ========== */
/* Using checkbox hack for pure HTML/CSS collapsible */
.detail-wrapper {
  background-color: #f9f9fa;
  border-radius: 0.5em;
  border: 1px solid rgba(60, 60, 67, 0.29);
  margin: 1em 0;
  padding: 1em;
}

/* Hide the checkbox */
.detail-checkbox {
  display: none;
}

/* Label as the clickable header */
.detail-label {
  cursor: pointer;
  font-weight: normal;
  display: flex;
  align-items: center;
  gap: 0.25em;
  user-select: none;
}

/* Arrow icon */
.detail-arrow {
  display: inline-block;
  transition: transform 0.2s linear;
  font-size: 0.8em;
}

/* Rotate arrow when checked */
.detail-checkbox:checked + .detail-label .detail-arrow {
  transform: rotate(90deg);
}

/* Content area */
.detail-content {
  padding-left: 1em;
  margin-top: 0.5em;
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease-out;
}

/* Show content when checked */
.detail-checkbox:checked ~ .detail-content {
  max-height: 9999px;
  transition: max-height 0.5s ease-in;
}

.detail-content p:last-child {
  margin-bottom: 0;
}

/* ========== Highlight Block (from highlight-block/components/HighlightBlock) ========== */
.highlight-block {
  padding: 1.25em;
  margin: 1em 0;
  border-radius: 0.5em;
}

.highlight-block-yellow { background: #fffbe6; }
.highlight-block-red { background: #fff2f0; }
.highlight-block-green { background: #f6ffed; }
.highlight-block-blue { background: #e6f7ff; }
.highlight-block-purple { background: #f9f0ff; }
.highlight-block-orange { background: #fff7e6; }
.highlight-block-gray { background: #f5f5f5; }
.highlight-block-pink { background: #fff0f6; }

.highlight-block p:last-child {
  margin-bottom: 0;
}

/* ========== Divide Line ========== */
.divide-line {
  border: none;
  border-top: 1px solid #e1e4e8;
  margin: 2em auto;
  width: 80%;
}

/* ========== Link (will be converted to footnotes for WeChat) ========== */
.link {
  color: rgb(30, 107, 184);
  text-decoration: none;
}

.footnote-word {
  color: rgb(30, 107, 184);
  font-weight: bold;
}

/* ========== Footnotes (for WeChat external links) ========== */
.footnote-ref {
  line-height: 0;
  color: rgb(30, 107, 184);
  font-weight: bold;
}

.footnotes-sep {
  margin: 30px 0 15px;
  padding: 0;
}

.footnotes-sep span {
  display: block;
  color: #000;
  font-size: 14px;
  font-family: Optima, "Microsoft YaHei", PingFangSC-regular, serif;
  line-height: 1.5em;
  letter-spacing: 0em;
  text-align: left;
  font-weight: bold;
}

.footnotes-section {
  margin: 0;
  padding: 0 0 0 2.5em;
  font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", SimSun, serif;
  font-size: 13px;
}

.footnote-item {
  display: flex;
  align-items: flex-start;
  font-size: 13px;
  line-height: 1.75em;
  letter-spacing: 0em;
  font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", SimSun, serif;
  margin: 0 0 0.35em;
}

.footnote-num {
  line-height: 1.75em;
  letter-spacing: 0em;
  color: rgba(0, 0, 0, 0.6);
  display: block;
  width: 2.4em;
  flex: 0 0 2.4em;
  text-align: left;
  font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", SimSun, serif;
  font-size: 13px;
}

.footnote-content {
  text-align: left;
  text-indent: 0em;
  color: #000;
  font-weight: normal;
  display: block;
  padding: 0;
  margin: 0;
  min-width: 0;
  word-break: break-word;
  overflow-wrap: anywhere;
  flex: 1;
  font-size: 13px;
  line-height: 1.75em;
  letter-spacing: 0em;
  font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", SimSun, serif;
}

.footnote-url {
  color: #000;
  font-weight: normal;
  font-style: italic;
  font-size: 13px;
  font-family: Georgia, "Times New Roman", "Noto Serif SC", "Songti SC", SimSun, serif;
}

/* ========== Highlight Mark ========== */
mark {
  padding: 0.1em 0.2em;
  border-radius: 2px;
}

${inlinePaletteHighlightStyles}

/* ========== Underline ========== */
.underline {
  border-bottom: 2px solid currentColor;
}

/* Underline colors（统一行内色板） */
.underline.underline-default {
  border-bottom-color: currentColor;
}
${inlinePaletteUnderlineStyles}

/* Underline line types */
.underline-solid { border-bottom-style: solid; }
.underline-dashed { border-bottom-style: dashed; }
.underline-dotted { border-bottom-style: dotted; }
.underline-wavy {
  border-bottom: none;
  text-decoration: underline wavy;
  text-decoration-color: currentColor;
  text-underline-offset: 2px;
}

/* ========== Math ========== */
.block-math {
  text-align: center;
  margin: 1em 0;
  overflow-x: auto;
}

.inline-math {
  display: inline-block;
}

.block-math-fallback,
.inline-math-fallback {
  font-family: "Times New Roman", serif;
  font-style: italic;
}

/* ========== Inline Image ========== */
.inline-image {
  max-height: 1.5em;
  vertical-align: middle;
}

/* ========== Annotation ========== */
.annotation {
  color: #1890ff;
  cursor: help;
  font-size: 0.8em;
}

/* ========== Comment ========== */
.comment {
  background: #fffbe6;
  border-bottom: 1px dashed #faad14;
}

/* ========== Flashcard Blank ========== */
.flashcard-blank {
  background: #e6f7ff;
  padding: 0.1em 0.5em;
  border-radius: 4px;
  border-bottom: 2px solid #1890ff;
}

/* ========== Summary Timestamp ========== */
.summary-timestamp {
  color: #1890ff;
  font-family: monospace;
  font-size: 0.9em;
}

/* ========== Placeholders ========== */
.video-placeholder,
.audio-placeholder,
.webview-placeholder,
.database-placeholder,
.whiteboard-placeholder {
  background: #f5f5f5;
  padding: 1em;
  text-align: center;
  color: #666;
  border-radius: 6px;
  margin: 1em 0;
}

.video-placeholder a,
.audio-placeholder a,
.webview-placeholder a {
  color: #1890ff;
}

/* ========== 插件源码静态导出 ========== */
.plugin-source-block {
  background: #f5f5f5;
  border-radius: 6px;
  padding: 1em;
  margin: 1em 0;
}

/* ========== AI Element ========== */
.ai-element {
  background: #f0f5ff;
  padding: 1em;
  border-radius: 6px;
  margin: 1em 0;
}

/* ========== Tabs ========== */
.tabs {
  margin: 1em 0;
}

/* ========== Code-like blocks (mermaid, abc, plantuml, etc.) ========== */
.mermaid-fallback,
.plantuml-fallback,
.tikz-fallback,
.typst-fallback {
  background: rgba(246, 248, 250, 0.9);
  border-radius: 0.5em;
  padding: 1em;
  margin: 1em 0;
  overflow-x: auto;
  font-family: Consolas, Monaco, Menlo, monospace;
  font-size: 14px;
  white-space: pre-wrap;
}

/* ABC Music Notation (rendered by abcjs) */
.abc-notation {
  margin: 1em 0;
  text-align: center;
  overflow-x: auto;
  position: relative;
  width: 100%;
}

/* ========== Diagram SVG containers ========== */
.diagram-svg {
  margin: 1em 0;
  text-align: center;
  overflow-x: auto;
  display: flex;
  justify-content: center;
  align-items: center;
}

.diagram-svg svg {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}

/* ========== Typst HTML container ========== */
.typst-html {
  margin: 1em 0;
  overflow-x: auto;
  text-align: center;
}

.typst-html > * {
  display: inline-block;
  margin: 0 auto;
}

/* ========== Styled Text (from styled-text/constants) ========== */
.styled-text {
  padding: 0.1em 0.3em;
  border-radius: 0.25em;
  margin: 0 0.125em;
}

.styled-text-red {
  color: #721C24;
  background-color: #F8D7DA;
}

.styled-text-green {
  color: #155724;
  background-color: #D4EDDA;
}

.styled-text-yellow {
  color: #856404;
  background-color: #FFF3CD;
}

.styled-text-blue {
  color: #0C5460;
  background-color: #D1ECF1;
}

.styled-text-purple {
  color: #6A1B9A;
  background-color: #EAE7FF;
}

.styled-text-gray {
  color: #383D41;
  background-color: #ECEFF1;
}
`;

/**
 * Get the complete WeChat-compatible CSS styles
 */
export const getWechatStyles = (): string => {
  return wechatBaseStyles;
};
