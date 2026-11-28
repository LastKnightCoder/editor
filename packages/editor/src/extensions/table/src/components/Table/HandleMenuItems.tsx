import React from "react";
import { Menu, cn } from "@tau/ui";
import { INLINE_PALETTE, inlineInk } from "@tau/editor/extensions/text-formatting/palette";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  Ban,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Eraser,
  TableCellsSplit,
  Trash2,
} from "lucide-react";

import type { TableAlign, TableRowColor } from "../../types";
import { useEditorI18n } from "../../../../../i18n";

export type HandleKind = "row" | "col";

export interface HandleMenuActions {
  insertBefore: () => void;
  insertAfter: () => void;
  setAlign: (align: TableAlign) => void;
  clear: () => void;
  remove: () => void;
  split: () => void;
  /** 行颜色：null 清除 */
  setRowColor: (color: TableRowColor | null) => void;
  /** 悬停色块时预览；undefined 结束预览 */
  previewRowColor: (color: TableRowColor | null | undefined) => void;
}

interface HandleMenuItemsProps {
  kind: HandleKind;
  from: number;
  to: number;
  /** 所选列的共同对齐；不一致时为 undefined（仅列菜单） */
  align?: TableAlign;
  /** 所选行的共同颜色（null 为无色）；不一致时为 undefined（仅行菜单） */
  rowColor?: TableRowColor | null;
  /** 所选行列涉及的合并格数量；为 0 时不显示拆分 */
  mergedCount: number;
  actions: HandleMenuActions;
}

const ICON = 15;

const title = (kind: HandleKind, from: number, to: number) => {
  const count = to - from + 1;
  if (kind === "col") return count > 1 ? `已选 ${count} 列` : `第 ${from + 1} 列`;
  if (count > 1) return `已选 ${count} 行`;
  return from === 0 ? "表头行" : `第 ${from} 行`;
};

interface RowColorPaletteProps {
  value: TableRowColor | null | undefined;
  onPick: (color: TableRowColor | null) => void;
  onPreview: (color: TableRowColor | null | undefined) => void;
}

/** 行颜色色板：无 + 行内着色 7 色；悬停预览、点击生效并关闭菜单 */
function RowColorPalette({ value, onPick, onPreview }: RowColorPaletteProps) {
  const { t } = useEditorI18n();
  const options: Array<{ id: TableRowColor | null; label: string }> = [
    { id: null, label: t("editorCommon.rowColorNone") },
    ...INLINE_PALETTE.map(entry => ({ id: entry.id, label: t(`palette.${entry.id}`) })),
  ];
  const current =
    value === undefined
      ? t("editorCommon.rowColorMixed")
      : value === null
        ? t("editorCommon.rowColorNone")
        : t(`palette.${value}`);
  return (
    <div className="px-1 pt-0.5 pb-1.5" onPointerLeave={() => onPreview(undefined)}>
      <div className="text-tau-tiny flex items-center justify-between px-1.5 pb-1.5 text-[var(--ed-text-tertiary)]">
        <span className="font-semibold tracking-[0.03em]">{t("editorCommon.rowColor")}</span>
        <span className="text-[var(--ed-text-secondary)]">{current}</span>
      </div>
      <Menu.RadioGroup
        value={value === undefined ? undefined : (value ?? "none")}
        onValueChange={next => onPick(next === "none" ? null : (next as TableRowColor))}
      >
        <div role="group" aria-label={t("editorCommon.rowColor")} className="flex gap-0.5">
          {options.map(option => (
            <div key={option.id ?? "none"} onPointerEnter={() => onPreview(option.id)}>
              <Menu.RadioItem
                value={option.id ?? "none"}
                className={cn(
                  "mb-0 h-[28px] w-[28px] justify-center gap-0 rounded-[7px] border-none bg-transparent p-0 transition-colors [&>span:first-child]:hidden [&>span:last-child]:flex [&>span:last-child]:flex-none",
                  value === option.id &&
                    "bg-[var(--ed-accent-soft)] shadow-[inset_0_0_0_1.5px_var(--ed-accent)]"
                )}
              >
                <span className="sr-only">{option.label}</span>
                <span
                  title={option.label}
                  className="flex h-[28px] w-[28px] items-center justify-center"
                >
                  {option.id ? (
                    <span
                      className="h-[16px] w-[16px] rounded-[5px]"
                      // 色块比行底色浓，小面积下也能分辨色相
                      style={{
                        backgroundColor: `color-mix(in srgb, ${inlineInk(option.id)} 32%, var(--ed-bg-surface))`,
                      }}
                    />
                  ) : (
                    <Ban size={15} className="text-[var(--ed-text-tertiary)]" />
                  )}
                </span>
              </Menu.RadioItem>
            </div>
          ))}
        </div>
      </Menu.RadioGroup>
    </div>
  );
}

/** 行 / 列手柄菜单：作用于手柄所选的整行 / 整列（可多选） */
export default function HandleMenuItems({
  kind,
  from,
  to,
  align,
  rowColor,
  mergedCount,
  actions,
}: HandleMenuItemsProps) {
  const count = to - from + 1;
  const isCol = kind === "col";
  return (
    <React.Fragment>
      <Menu.Group>{title(kind, from, to)}</Menu.Group>
      {!isCol && (
        <React.Fragment>
          <RowColorPalette
            value={rowColor}
            onPick={actions.setRowColor}
            onPreview={actions.previewRowColor}
          />
          <Menu.Separator />
        </React.Fragment>
      )}
      <Menu.Item
        icon={isCol ? <ArrowLeft size={ICON} /> : <ArrowUp size={ICON} />}
        onSelect={actions.insertBefore}
      >
        {isCol ? "在左侧插入列" : "在上方插入行"}
      </Menu.Item>
      <Menu.Item
        icon={isCol ? <ArrowRight size={ICON} /> : <ArrowDown size={ICON} />}
        onSelect={actions.insertAfter}
      >
        {isCol ? "在右侧插入列" : "在下方插入行"}
      </Menu.Item>
      {isCol && (
        <React.Fragment>
          <Menu.Separator />
          <Menu.RadioGroup
            value={align === undefined ? undefined : (align ?? "left")}
            onValueChange={value => actions.setAlign(value as TableAlign)}
          >
            <Menu.RadioItem value="left" icon={<AlignLeft size={ICON} />}>
              左对齐
            </Menu.RadioItem>
            <Menu.RadioItem value="center" icon={<AlignCenter size={ICON} />}>
              居中
            </Menu.RadioItem>
            <Menu.RadioItem value="right" icon={<AlignRight size={ICON} />}>
              右对齐
            </Menu.RadioItem>
          </Menu.RadioGroup>
        </React.Fragment>
      )}
      <Menu.Separator />
      {mergedCount > 0 && (
        <Menu.Item icon={<TableCellsSplit size={ICON} />} onSelect={actions.split}>
          {mergedCount > 1 ? `拆分合并单元格（${mergedCount}）` : "拆分合并单元格"}
        </Menu.Item>
      )}
      <Menu.Item icon={<Eraser size={ICON} />} onSelect={actions.clear}>
        清空内容
      </Menu.Item>
      <Menu.Item icon={<Trash2 size={ICON} />} kbd="⌫" danger onSelect={actions.remove}>
        {count > 1 ? `删除 ${count} ${isCol ? "列" : "行"}` : isCol ? "删除列" : "删除行"}
      </Menu.Item>
    </React.Fragment>
  );
}
