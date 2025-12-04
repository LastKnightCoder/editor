import { useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
interface SlideViewportProps {
  width: number;
  height: number;
  baseFontScale: number;
  background?: string;
  children: React.ReactNode;
  className?: string;
}

const SlideViewport = ({
  width,
  height,
  baseFontScale,
  background = "#ffffff",
  children,
  className,
}: SlideViewportProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateScale = () => {
      if (!container) return;
      const wScale = container.clientWidth / width;
      const hScale = container.clientHeight / height;
      setScale(Math.min(wScale, hScale));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);

    return () => observer.disconnect();
  }, [width, height]);

  const fontSize = useMemo(
    () => baseFontScale * scale * 16,
    [baseFontScale, scale],
  );

  return (
    <div
      ref={containerRef}
      className={classNames(
        "relative w-full h-full flex items-center justify-center overflow-hidden",
        className,
      )}
    >
      <div
        className="relative rounded-2xl shadow-xl shadow-indigo-200/40 overflow-hidden"
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          fontSize,
          background,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default SlideViewport;
