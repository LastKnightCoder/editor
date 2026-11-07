export function initScrollFade({ stickyHeader = false } = {}) {
  const root = document.scrollingElement ?? document.documentElement;
  const top = document.createElement("div");
  const bottom = document.createElement("div");
  top.className = "site-scroll-fade site-scroll-fade-top";
  top.classList.toggle("site-scroll-fade-header", stickyHeader);
  bottom.className = "site-scroll-fade site-scroll-fade-bottom";
  top.setAttribute("aria-hidden", "true");
  bottom.setAttribute("aria-hidden", "true");
  document.body.append(top, bottom);

  let frame = 0;
  const update = () => {
    frame = 0;
    top.classList.toggle("on", root.scrollTop > 1);
    bottom.classList.toggle("on", root.scrollHeight - root.scrollTop - root.clientHeight > 1);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule);
  new ResizeObserver(schedule).observe(document.body);
  update();
}
