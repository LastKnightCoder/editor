import { memo, useCallback, useEffect, useState } from "react";

const THRESHOLD = 300;

const ScrollToTop = memo(() => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > THRESHOLD);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleClick = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="回到顶部"
      className="fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-bg-container)] text-[var(--color-text-secondary)] transition-all hover:text-[var(--color-text-primary)]"
      style={{ boxShadow: "var(--shadow-elevated)" }}
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
    </button>
  );
});

ScrollToTop.displayName = "ScrollToTop";

export default ScrollToTop;
