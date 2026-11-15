const allHighlights = "tau-global-find";
const currentHighlight = "tau-global-find-current";

export function clearFindHighlights() {
  window.CSS?.highlights?.delete(allHighlights);
  window.CSS?.highlights?.delete(currentHighlight);
}

export function showFindHighlights(current: Range | undefined, all: Range[] = []) {
  clearFindHighlights();
  if (!window.CSS?.highlights || typeof window.Highlight !== "function") return;
  if (all.length) window.CSS.highlights.set(allHighlights, new Highlight(...all));
  if (current) window.CSS.highlights.set(currentHighlight, new Highlight(current));
}
