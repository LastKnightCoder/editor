import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SidebarToggleButtonProps {
  /** 侧边栏是否隐藏 */
  isHidden: boolean;
  /** 点击切换回调 */
  onToggle: () => void;
  /** 按钮位置，默认 left */
  side?: "left" | "right";
}

/**
 * 侧边栏收起按钮（放在侧边栏内部）
 */
export const SidebarCollapseButton = ({
  onToggle,
  side = "left",
}: Omit<SidebarToggleButtonProps, "isHidden">) => {
  const isLeft = side === "left";

  return (
    <div
      className={`absolute ${isLeft ? "right-0" : "left-0"} top-1/2 z-20 h-20 w-5 -translate-y-1/2 ${isLeft ? "rounded-l-2xl" : "rounded-r-2xl"} bg-surface/90 border-t border-b backdrop-blur-xl ${isLeft ? "border-l" : "border-r"} border-line-1 hover:bg-hover hover:border-ink-3/50 flex cursor-pointer items-center justify-center ${isLeft ? "shadow-[-2px_0_8px_rgba(0,0,0,0.06)]" : "shadow-[2px_0_8px_rgba(0,0,0,0.06)]"} transition-colors duration-200`}
      onClick={onToggle}
      title="收起侧边栏"
    >
      {isLeft ? (
        <ChevronLeft size={14} className="text-accent" strokeWidth={2.5} />
      ) : (
        <ChevronRight size={14} className="text-accent" strokeWidth={2.5} />
      )}
    </div>
  );
};

/**
 * 侧边栏展开按钮（放在侧边栏外部）
 */
export const SidebarExpandButton = ({
  isHidden,
  onToggle,
  side = "left",
}: SidebarToggleButtonProps) => {
  const isLeft = side === "left";
  const [isHovering, setIsHovering] = useState(false);

  // 当 isHidden 变化时重置 hover 状态
  useEffect(() => {
    if (isHidden) {
      setIsHovering(false);
    }
  }, [isHidden]);

  return (
    <AnimatePresence>
      {isHidden && (
        <motion.div
          className="absolute top-0 bottom-0 z-20"
          style={{
            [isLeft ? "left" : "right"]: 0,
            width: "20px",
          }}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          initial={{ opacity: 0, x: isLeft ? -10 : 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: isLeft ? -10 : 10 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <div
            className={`absolute ${isLeft ? "left-0" : "right-0"} top-1/2 h-20 w-5 -translate-y-1/2 ${isLeft ? "rounded-r-2xl" : "rounded-l-2xl"} bg-surface/90 border-t border-b backdrop-blur-xl ${isLeft ? "border-r" : "border-l"} border-line-1 hover:bg-hover hover:border-ink-3/50 flex cursor-pointer items-center justify-center ${isLeft ? "shadow-[2px_0_8px_rgba(0,0,0,0.06)]" : "shadow-[-2px_0_8px_rgba(0,0,0,0.06)]"} transition-all duration-200`}
            style={{
              opacity: isHovering ? 1 : 0,
            }}
            onClick={onToggle}
            title="展开侧边栏"
          >
            {isLeft ? (
              <ChevronRight size={14} className="text-accent" strokeWidth={2.5} />
            ) : (
              <ChevronLeft size={14} className="text-accent" strokeWidth={2.5} />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
