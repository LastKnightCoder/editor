import { memo, useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

const THRESHOLD = 300;
const SCROLL_CONTAINER_SELECTOR =
  "[data-primary-scroll-container], [data-page-scroll-container]";
const SCROLLBAR_WIDTH = 6;
const BUTTON_TO_SCROLLBAR_GAP = 48;
const VIEWPORT_EDGE_OFFSET = 64;

const ScrollToTop = memo(() => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const scrollContainer = document.querySelector<HTMLElement>(
      SCROLL_CONTAINER_SELECTOR,
    );

    if (!scrollContainer) {
      setVisible(window.scrollY > THRESHOLD);
      const onWindowScroll = () => setVisible(window.scrollY > THRESHOLD);
      window.addEventListener("scroll", onWindowScroll, { passive: true });
      return () => window.removeEventListener("scroll", onWindowScroll);
    }

    const onContainerScroll = () =>
      setVisible(scrollContainer.scrollTop > THRESHOLD);

    onContainerScroll();
    scrollContainer.addEventListener("scroll", onContainerScroll, {
      passive: true,
    });

    return () =>
      scrollContainer.removeEventListener("scroll", onContainerScroll);
  }, []);

  const handleClick = useCallback(() => {
    const scrollContainer = document.querySelector<HTMLElement>(
      SCROLL_CONTAINER_SELECTOR,
    );

    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={handleClick}
          aria-label="回到顶部"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
          className="fixed z-50 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-bg-container)] text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-accent)]"
          style={{
            right: `calc(env(safe-area-inset-right, 0px) + ${SCROLLBAR_WIDTH + BUTTON_TO_SCROLLBAR_GAP}px)`,
            bottom: `calc(env(safe-area-inset-bottom, 0px) + ${VIEWPORT_EDGE_OFFSET}px)`,
            boxShadow: "var(--shadow-elevated)",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 12V4" />
            <path d="M4 7l4-4 4 4" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
});

ScrollToTop.displayName = "ScrollToTop";

export default ScrollToTop;
