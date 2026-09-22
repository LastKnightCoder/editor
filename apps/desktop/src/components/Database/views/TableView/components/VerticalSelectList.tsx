import { SelectOption } from "../../../types";
import { SELECT_COLORS } from "../../../constants";
import { memo, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { ColorSwatch, Tag, Input, Menu } from "@tau/ui";

interface VerticalSelectListProps {
  options: SelectOption[];
  onSelect?: (option: SelectOption) => void;
  onDelete?: (option: SelectOption) => void;
  onEdit?: (option: SelectOption, newName: string) => void;
  onColorChange?: (option: SelectOption, color: (typeof SELECT_COLORS)[number]) => void;
  className?: string;
}

const VerticalSelectList = memo((props: VerticalSelectListProps) => {
  const { options, onSelect, onDelete, onEdit, onColorChange, className } = props;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");

  if (options.length === 0) {
    return null;
  }

  const handleEditComplete = (option: SelectOption) => {
    if (editingValue.trim()) {
      onEdit?.(option, editingValue.trim());
    }
    setEditingId(null);
    setEditingValue("");
  };

  const renderOptionRow = (option: SelectOption) => {
    if (editingId === option.id) {
      return (
        <Input
          variant="bare"
          value={editingValue}
          onChange={e => setEditingValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") handleEditComplete(option);
          }}
          onBlur={() => handleEditComplete(option)}
          autoFocus
          className="text-tau-sm min-w-[60px]"
          onClick={e => e.stopPropagation()}
        />
      );
    }
    return <Tag color={option.color}>{option.name}</Tag>;
  };

  const hasActions = onDelete || onColorChange || onEdit;

  return (
    <div className={`flex h-full flex-col gap-1 ${className}`}>
      {options.map(option => {
        if (!hasActions) {
          return (
            <div
              key={option.id}
              className="hover:bg-hover rounded-tau-sm cursor-pointer p-1"
              onClick={() => !editingId && onSelect?.(option)}
            >
              {renderOptionRow(option)}
            </div>
          );
        }

        return (
          <div
            key={option.id}
            className="group/vs hover:bg-hover rounded-tau-sm flex cursor-pointer items-center justify-between p-1"
            onClick={() => !editingId && onSelect?.(option)}
          >
            {renderOptionRow(option)}
            <Menu
              align="end"
              trigger={
                <button
                  type="button"
                  title="选项操作"
                  className="text-ink-3 hover:bg-press hover:text-ink-1 grid size-[22px] shrink-0 place-items-center rounded-[7px] opacity-0 transition-opacity focus-visible:opacity-100 group-hover/vs:opacity-100"
                  onClick={e => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" strokeWidth={1.75} />
                </button>
              }
            >
              {onEdit && (
                <Menu.Item
                  onSelect={() => {
                    setEditingId(option.id);
                    setEditingValue(option.name);
                  }}
                >
                  编辑选项
                </Menu.Item>
              )}
              {onColorChange && (
                <Menu.Submenu label="修改颜色">
                  <div className="p-2">
                    <ColorSwatch
                      value={option.color}
                      onChange={color => onColorChange(option, color)}
                    />
                  </div>
                </Menu.Submenu>
              )}
              {onDelete && (
                <Menu.Item danger onSelect={() => onDelete(option)}>
                  删除
                </Menu.Item>
              )}
            </Menu>
          </div>
        );
      })}
    </div>
  );
});

VerticalSelectList.displayName = "VerticalSelectList";

export default VerticalSelectList;
