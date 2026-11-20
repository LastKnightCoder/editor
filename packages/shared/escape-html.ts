/** HTML 文本与属性值的最小转义集（& < > " '）；单引号统一用 &#39;，其余实体交给上下文 */
export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
