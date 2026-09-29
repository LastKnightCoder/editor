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
          "flex w-full items-start gap-[12px] rounded-[16px] p-[10px_14px] text-left transition-[background-color,box-shadow] duration-150 ease-[ease]",
          active &&
            "bg-[var(--ed-bg-selected)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--ed-accent)_25%,transparent)]"
        )}
        onClick={onClick}
      >
        <span className="flex size-[36px] shrink-0 items-center justify-center rounded-[14px] bg-[var(--ed-bg-press)]">
          <IconComponent className="size-[18px] text-[var(--ed-text-secondary)]" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className="text-[14px] font-semibold text-[var(--ed-text)]">{item.title}</span>
          {item.description && (
            <span className="block truncate text-[12px] leading-[1.4] text-[var(--ed-text-secondary)]">
              {item.description}
            </span>
          )}
        </div>
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
