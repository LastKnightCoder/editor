import workletURL from "./marker-painter.js?url";

window.global ||= window;

// 允许 class="allow-tab" 的元素保持可聚焦
document.addEventListener("keydown", (e: KeyboardEvent) => {
  if (
    e.key === "Tab" &&
    e.target instanceof HTMLElement &&
    !e.target.matches(".allow-tab")
  ) {
    e.preventDefault();
  }
});

CSS.paintWorklet.addModule(workletURL);
