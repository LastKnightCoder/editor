import { memo } from "react";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import { FolderInput, Trash2, X } from "lucide-react";
import classNames from "classnames";
import { AnimatePresence, motion } from "motion/react";
import useThemeColors from "@/hooks/useThemeColors";

interface BatchOperationBarProps {
  count: number;
  groupMenuItems: MenuProps["items"];
  onDelete: () => void;
  onCancel: () => void;
}

const BatchOperationBar = memo(
  ({ count, groupMenuItems, onDelete, onCancel }: BatchOperationBarProps) => {
    const themeColors = useThemeColors();

    return (
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className={classNames(
              "absolute top-16 left-1/2 -translate-x-1/2 z-20",
              "h-9 px-2 rounded-xl flex items-center gap-1 shadow-lg border",
              "bg-[var(--th-bg-elevated)] backdrop-blur-xl",
              themeColors.borderClass,
            )}
          >
            <span
              className={classNames(
                "px-2 text-sm font-medium",
                themeColors.activeTextClass,
              )}
            >
              已选 {count} 项
            </span>
            <div
              className={classNames(
                "w-px h-4",
                themeColors.divideClass,
                "border-l",
              )}
            />
            {groupMenuItems && groupMenuItems.length > 0 && (
              <Dropdown menu={{ items: groupMenuItems }} trigger={["click"]}>
                <button
                  className={classNames(
                    "h-7 px-2.5 rounded-lg flex items-center gap-1.5 text-sm cursor-pointer transition-colors",
                    themeColors.hoverClass,
                    themeColors.activeTextClass,
                  )}
                >
                  <FolderInput size={14} />
                  移动到分组
                </button>
              </Dropdown>
            )}
            <button
              onClick={onDelete}
              className={classNames(
                "h-7 px-2.5 rounded-lg flex items-center gap-1.5 text-sm cursor-pointer transition-colors hover:bg-[var(--th-danger)]/10 text-[var(--th-danger)]",
              )}
            >
              <Trash2 size={14} />
              删除
            </button>
            <button
              onClick={onCancel}
              className={classNames(
                "w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-colors",
                themeColors.hoverClass,
                themeColors.secondaryTextClass,
              )}
              title="取消选择"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    );
  },
);

export default BatchOperationBar;
