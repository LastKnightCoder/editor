/** 整篇一节的类型（卡片、摘录、PDF 标注）：命中块只用于摘要，不作为打开定位 */
const WHOLE_TYPES = new Set(["card", "excerpt", "pdf-annotation"]);

/** 检索命中的节能否用于打开定位 */
export const locatesSection = (type: string): boolean => !WHOLE_TYPES.has(type);
