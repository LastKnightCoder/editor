import { useState, useRef, useEffect } from "react";
import classnames from "classnames";

interface ResizablePanelProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  defaultLeftWidth?: number; // 百分比
  minLeftWidth?: number; // 百分比
  maxLeftWidth?: number; // 百分比
  className?: string;
}

const ResizablePanel = ({
  leftPanel,
  rightPanel,
  defaultLeftWidth = 50,
  minLeftWidth = 20,
  maxLeftWidth = 80,
  className,
}: ResizablePanelProps) => {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newLeftWidth =
        ((e.clientX - containerRect.left) / containerRect.width) * 100;

      setLeftWidth(
        Math.max(minLeftWidth, Math.min(maxLeftWidth, newLeftWidth)),
      );
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, minLeftWidth, maxLeftWidth]);

  return (
    <div
      ref={containerRef}
      className={classnames("flex h-full w-full relative", className)}
      style={{ cursor: isDragging ? "col-resize" : "default" }}
    >
      <div
        className="overflow-auto"
        style={{ width: `${leftWidth}%`, minWidth: 0 }}
      >
        {leftPanel}
      </div>

      <div
        className={classnames(
          "w-1 cursor-col-resize hover:bg-blue-400 transition-colors relative group flex-shrink-0",
          isDragging ? "bg-blue-500" : "bg-transparent",
        )}
        onMouseDown={() => setIsDragging(true)}
      >
        <div className="absolute inset-y-0 -left-1 -right-1 flex items-center justify-center">
          <div className="w-1 h-12 bg-gray-300 dark:bg-gray-600 rounded-full group-hover:bg-blue-400 transition-colors" />
        </div>
      </div>

      <div
        className="overflow-auto"
        style={{ width: `${100 - leftWidth}%`, minWidth: 0 }}
      >
        {rightPanel}
      </div>
    </div>
  );
};

export default ResizablePanel;
