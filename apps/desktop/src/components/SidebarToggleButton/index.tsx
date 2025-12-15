import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import useThemeColors from "@/hooks/useThemeColors";

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
  const { glassPanelBg, borderClass, hoverClass, hoverBorderClass, iconTextClass } =
    useThemeColors();

  return (
    <div
      className={`absolute ${isLeft ? "right-0" : "left-0"} top-1/2 -translate-y-1/2 z-20
                 w-5 h-20 ${isLeft ? "rounded-l-2xl" : "rounded-r-2xl"}
                 ${glassPanelBg}
                 border-t border-b ${isLeft ? "border-l" : "border-r"} ${borderClass}
                 flex items-center justify-center
                 cursor-pointer
                 ${hoverClass}
                 ${hoverBorderClass}
                 ${isLeft ? "shadow-[-2px_0_8px_rgba(0,0,0,0.06)]" : "shadow-[2px_0_8px_rgba(0,0,0,0.06)]"}
                 transition-colors duration-200`}
      onClick={onToggle}
      title="收起侧边栏"
    >
      {isLeft ? (
        <ChevronLeft size={14} className={iconTextClass} strokeWidth={2.5} />
      ) : (
        <ChevronRight size={14} className={iconTextClass} strokeWidth={2.5} />
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
  const { glassPanelBg, borderClass, hoverClass, hoverBorderClass, iconTextClass } =
    useThemeColors();

  return (
    <AnimatePresence>
      {isHidden && (
        <motion.div
          className={`absolute ${isLeft ? "left-0" : "right-0"} top-1/2 -translate-y-1/2 z-20
                     w-5 h-20 ${isLeft ? "rounded-r-2xl" : "rounded-l-2xl"}
                     ${glassPanelBg}
                     border-t border-b ${isLeft ? "border-r" : "border-l"} ${borderClass}
                     flex items-center justify-center
                     cursor-pointer
                     ${hoverClass}
                     ${hoverBorderClass}
                     ${isLeft ? "shadow-[2px_0_8px_rgba(0,0,0,0.06)]" : "shadow-[-2px_0_8px_rgba(0,0,0,0.06)]"}
                     transition-colors duration-200`}
          onClick={onToggle}
          title="展开侧边栏"
          initial={{ opacity: 0, x: isLeft ? -10 : 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: isLeft ? -10 : 10 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          {isLeft ? (
            <ChevronRight size={14} className={iconTextClass} strokeWidth={2.5} />
          ) : (
            <ChevronLeft size={14} className={iconTextClass} strokeWidth={2.5} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * 侧边栏切换按钮组件（兼容旧的使用方式）
 *
 * 特点：
 * - 把手样式设计，圆润的过渡
 * - 支持左右两侧
 * - 展开/收起状态自动切换图标
 * - 带平滑动画
 *
 * 注意：这个组件同时包含收起和展开按钮
 * 如果需要分开放置，请使用 SidebarCollapseButton 和 SidebarExpandButton
 */
const SidebarToggleButton = ({ isHidden, onToggle, side = "left" }: SidebarToggleButtonProps) => {
  return (
    <>
      {!isHidden && <SidebarCollapseButton onToggle={onToggle} side={side} />}
      <SidebarExpandButton isHidden={isHidden} onToggle={onToggle} side={side} />
    </>
  );
};

SidebarToggleButton.Collapse = SidebarCollapseButton;
SidebarToggleButton.Expand = SidebarExpandButton;

export default SidebarToggleButton;
