import { ChevronRight } from "lucide-react";
import { cn } from "@tau/ui";
import { memo, useEffect, useRef } from "react";

import { IBlockPanelListItem } from "../../types";

import { menuItemArrowClass, menuItemClass } from "../../EditorContextMenu/menuClasses";

interface IItemProps {
  item: IBlockPanelListItem;
  active: boolean;
  hasChildren: boolean;
  shouldAutoScroll: boolean;
  onAnchorChange?: (element: HTMLButtonElement | null) => void;
  onClick?: () => void;
}

const Item = memo(
  ({ item, active, hasChildren, shouldAutoScroll, onAnchorChange, onClick }: IItemProps) => {
    const IconComponent = item.icon;
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
      if (active && shouldAutoScroll) {
        buttonRef.current?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
        });
      }
    }, [active, shouldAutoScroll]);

    useEffect(() => {
      const element = buttonRef.current;
      if (onAnchorChange) {
        onAnchorChange(element);
      }
      return () => {
        if (onAnchorChange) {
          onAnchorChange(null);
        }
      };
    }, [onAnchorChange]);

    return (
      <button
        type="button"
        ref={buttonRef}
        className={cn(
          menuItemClass,
          "flex w-full items-center gap-[10px] rounded-[12px] p-[6px_10px] text-left transition-[background-color,box-shadow] duration-150 ease-[ease]",
          active &&
            "bg-[var(--ed-bg-selected)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--ed-accent)_25%,transparent)]"
        )}
        onClick={onClick}
      >
        <span className="flex size-[28px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--ed-bg-press)]">
          <IconComponent className="size-[16px] text-[var(--ed-text-secondary)]" />
        </span>
        {/* description 多与标题重复，只参与搜索匹配，不展示 */}
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--ed-text)]">
          {item.title}
        </span>
        {hasChildren && (
          <span className={cn(menuItemArrowClass, "ml-[8px]")}>
            <ChevronRight size={14} />
          </span>
        )}
      </button>
    );
  }
);

Item.displayName = "BlockPanelItem";

export default Item;
