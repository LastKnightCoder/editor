/**
 * 侧栏标签行的 ⋯ 菜单（重命名 / 删除）。
 * 计数与 ⋯ 叠在同一槽位：悬停或菜单打开时计数隐去、⋯ 显出，行宽不变。
 */

import { useTagsI18n } from "./i18n";
import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Menu, cn } from "@tau/ui";

export function TagRowCountSlot({
  count,
  label,
  onRename,
  onDelete,
}: {
  count: number;
  label: string;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t, locale } = useTagsI18n();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative grid h-[21px] min-w-[21px] shrink-0 place-items-center">
      <span
        className={cn(
          "text-tau-tiny text-ink-3 font-normal tabular-nums group-hover/tag:invisible",
          open && "invisible"
        )}
      >
        {count.toLocaleString(locale)}
      </span>
      <Menu
        align="start"
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button
            type="button"
            aria-label={t("manage", { tag: label })}
            className={cn(
              "text-ink-3 hover:text-ink-1 aria-expanded:text-ink-1 absolute inset-0 grid place-items-center rounded-[6px] opacity-0 outline-none focus-visible:opacity-100 group-hover/tag:opacity-100",
              open && "opacity-100"
            )}
          >
            <MoreHorizontal className="size-[13px]" strokeWidth={1.75} />
          </button>
        }
      >
        <Menu.Item icon={<Pencil className="size-[15px]" strokeWidth={1.75} />} onSelect={onRename}>
          {t("rename.menu")}
        </Menu.Item>
        <Menu.Item
          danger
          icon={<Trash2 className="size-[15px]" strokeWidth={1.75} />}
          onSelect={onDelete}
        >
          {t("delete.menu")}
        </Menu.Item>
      </Menu>
    </span>
  );
}
