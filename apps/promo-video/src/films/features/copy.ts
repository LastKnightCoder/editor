/** 功能片文案：章节宣言 */
export const MANIFESTOS = {
  wysiwyg: { text: "所见，即所得。", sub: "打下 Markdown，当场成型", accent: [0, 2] as [number, number] },
  blocks: { text: "一个块，就是一种表达。", sub: "表格 · 代码 · 公式 · 图表 · 数据库 · 白板……", accent: [2, 3] as [number, number] },
  compose: { text: "不必从一张白纸开始。", sub: "创作模式 · AI 从你的笔记里召集资料", accent: [5, 7] as [number, number] },
};

export const FEATURE_GLYPHS = Object.values(MANIFESTOS)
  .map(m => m.text + m.sub)
  .join("");
