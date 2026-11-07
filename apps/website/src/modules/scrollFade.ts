export function initScrollFade({ stickyHeader = false } = {}) {
  const root = document.scrollingElement ?? document.documentElement;
  root.classList.add("site-custom-scrollbar");

  const top = document.createElement("div");
  const bottom = document.createElement("div");
  top.className = "site-scroll-fade site-scroll-fade-top";
  top.classList.toggle("site-scroll-fade-header", stickyHeader);
  bottom.className = "site-scroll-fade site-scroll-fade-bottom";
  top.setAttribute("aria-hidden", "true");
  bottom.setAttribute("aria-hidden", "true");

  const track = document.createElement("div");
  const thumb = document.createElement("div");
  track.className = "site-root-scrollbar";
  thumb.className = "site-root-scrollbar-thumb";
  track.setAttribute("aria-hidden", "true");
  track.append(thumb);
  document.body.append(top, bottom, track);

  let frame = 0;
  const update = () => {
    frame = 0;
    const viewportHeight = root.clientHeight;
    const scrollHeight = root.scrollHeight;
    const maxScrollTop = Math.max(0, scrollHeight - viewportHeight);
    const scrollTop = Math.min(maxScrollTop, Math.max(0, root.scrollTop));
    top.classList.toggle("on", scrollTop > 1);
    bottom.classList.toggle("on", maxScrollTop - scrollTop > 1);

    track.hidden = maxScrollTop <= 1;
    const trackHeight = track.clientHeight;
    const thumbHeight = track.hidden
      ? 0
      : Math.min(trackHeight, Math.max(24, (viewportHeight / scrollHeight) * trackHeight));
    const maxOffset = Math.max(0, trackHeight - thumbHeight);
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${maxScrollTop ? (scrollTop / maxScrollTop) * maxOffset : 0}px)`;
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const scrollTo = (top: number) => root.scrollTo({ top, behavior: "instant" });

  let drag: {
    pointerId: number;
    startY: number;
    startScrollTop: number;
    maxScrollTop: number;
    maxOffset: number;
  } | null = null;

  thumb.addEventListener("pointerdown", event => {
    const maxScrollTop = root.scrollHeight - root.clientHeight;
    const maxOffset = track.clientHeight - thumb.offsetHeight;
    if (maxScrollTop <= 1 || maxOffset <= 0) return;
    event.preventDefault();
    drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: root.scrollTop,
      maxScrollTop,
      maxOffset,
    };
    track.classList.add("dragging");
    thumb.setPointerCapture(event.pointerId);
  });
  thumb.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const delta = ((event.clientY - drag.startY) / drag.maxOffset) * drag.maxScrollTop;
    scrollTo(Math.min(drag.maxScrollTop, Math.max(0, drag.startScrollTop + delta)));
  });
  const finishDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    track.classList.remove("dragging");
    schedule();
  };
  thumb.addEventListener("pointerup", finishDrag);
  thumb.addEventListener("pointercancel", finishDrag);

  track.addEventListener("pointerdown", event => {
    if (event.target !== track) return;
    event.preventDefault();
    const maxOffset = track.clientHeight - thumb.offsetHeight;
    if (maxOffset <= 0) return;
    const bounds = track.getBoundingClientRect();
    const ratio = (event.clientY - bounds.top - thumb.offsetHeight / 2) / maxOffset;
    const maxScrollTop = root.scrollHeight - root.clientHeight;
    scrollTo(Math.min(1, Math.max(0, ratio)) * maxScrollTop);
  });

  let liveTimer: ReturnType<typeof setTimeout> | undefined;
  const markScrollLive = () => {
    root.classList.add("scrollbar-live");
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => root.classList.remove("scrollbar-live"), 700);
  };

  addEventListener(
    "scroll",
    () => {
      markScrollLive();
      schedule();
    },
    { passive: true }
  );
  addEventListener("resize", schedule);
  new ResizeObserver(schedule).observe(document.body);
  update();
}
