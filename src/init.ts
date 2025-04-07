// import workletURL from "./marker-painter.ts?url";
import workletCode from "./marker-painter.js?raw";
const blob = new Blob([workletCode], { type: "application/javascript" });
CSS.paintWorklet.addModule(URL.createObjectURL(blob));

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

// CSS.paintWorklet.addModule(workletURL);
