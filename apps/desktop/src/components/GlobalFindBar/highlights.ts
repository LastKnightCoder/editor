const allHighlights = "tau-global-find";
const currentHighlight = "tau-global-find-current";

export function clearFindHighlights() {
  window.CSS?.highlights?.delete(allHighlights);
  window.CSS?.highlights?.delete(currentHighlight);
}

export function showFindHighlights(current: Range | undefined, all: Range[] = []) {
  clearFindHighlights();
  if (!window.CSS?.highlights || typeof window.Highlight !== "function") return;
  // 排除当前命中，避免其余命中的底线叠加到当前实底高亮上。
  const others = current ? all.filter(range => range !== current) : all;
  if (others.length) window.CSS.highlights.set(allHighlights, new Highlight(...others));
  if (current) window.CSS.highlights.set(currentHighlight, new Highlight(current));
}
