window.global ||= window;

// 允许 class="allow-tab" 的元素保持可聚焦
document.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && !e.target.matches(".allow-tab")) {
    e.preventDefault();
  }
});
