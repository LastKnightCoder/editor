import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 页边注 → 正文标注块的虚线连接线：SVG 覆盖宿主纸面容器（须 position:relative），
 * 一端取面板选中条目节点，另一端取带 data-history-mark 的正文块。
 * 坐标随容器内任意滚动 / 尺寸 / DOM 变化重算（样板 useCommentPositions）。
 */
export function HistoryLinks({
  containerRef,
  getAnchor,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  getAnchor: () => HTMLElement | null;
}) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [svg, setSvg] = useState("");

  useEffect(() => setContainer(containerRef.current), [containerRef]);

  const redraw = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    const anchor = getAnchor();
    const blocks = root.querySelectorAll<HTMLElement>("[data-history-mark]");
    if (!anchor || !blocks.length) {
      setSvg("");
      return;
    }
    const rootRect = root.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const ax = anchorRect.left - rootRect.left - 8;
    const ay = anchorRect.top - rootRect.top + anchorRect.height / 2;
    let markup = "";
    blocks.forEach(block => {
      const rect = block.getBoundingClientRect();
      const bx = rect.right - rootRect.left + 6;
      const by = rect.top - rootRect.top + 14;
      const mx = (ax + bx) / 2;
      markup += `<path d="M ${bx} ${by} C ${mx} ${by}, ${mx} ${ay}, ${ax} ${ay}" fill="none" stroke="var(--tau-accent)" stroke-opacity="0.35" stroke-width="1.2" stroke-dasharray="3 3"/><circle cx="${bx}" cy="${by}" r="2.5" fill="var(--tau-bg-surface)" stroke="var(--tau-accent)" stroke-opacity="0.5"/><circle cx="${ax}" cy="${ay}" r="2.5" fill="var(--tau-bg-surface)" stroke="var(--tau-accent)" stroke-opacity="0.5"/>`;
    });
    setSvg(markup);
  }, [containerRef, getAnchor]);

  useEffect(() => {
    if (!container) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(redraw);
    };
    schedule();
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(container);
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-history-mark"],
    });
    container.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      container.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
    };
  }, [container, redraw]);

  if (!container || !svg) return null;
  return createPortal(
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[5] overflow-visible"
      dangerouslySetInnerHTML={{ __html: svg }}
    />,
    container
  );
}
