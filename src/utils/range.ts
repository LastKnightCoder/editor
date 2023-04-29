export const focusStart = (el: HTMLElement) => {
  if (!el) return;
  const range = document.createRange();
  const sel = window.getSelection();
  if (el.childNodes.length > 0) {
    range.setStart(el.childNodes[0], 0);
  } else {
    range.setStart(el, 0);
  }
  range.collapse(true);
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

export const focusEnd = (el: HTMLElement) => {
  if (!el) return;
  const range = document.createRange();
  const sel = window.getSelection();
  if (el.childNodes.length > 0) {
    range.setStart(el.childNodes[0], el.childNodes[0].textContent?.length || 0);
  } else {
    range.setStart(el, 0);
  }
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(range);
  }
}
