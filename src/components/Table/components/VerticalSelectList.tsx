import { SelectOption } from "../types";
import { SELECT_COLORS_CONFIG, SELECT_COLORS } from "../constants";
import classNames from "classnames";
import { Dropdown, Input } from "antd";
import { memo, useState } from "react";
import { EllipsisOutlined } from "@ant-design/icons";

interface VerticalSelectListProps {
  options: SelectOption[];
  theme: "light" | "dark";
  onSelect?: (option: SelectOption) => void;
  onDelete?: (option: SelectOption) => void;
  onEdit?: (option: SelectOption, newName: string) => void;
  onColorChange?: (
    option: SelectOption,
    color: (typeof SELECT_COLORS)[number],
  ) => void;
  className?: string;
}

const VerticalSelectList = memo((props: VerticalSelectListProps) => {
  const {
    options,
    theme,
    onSelect,
    onDelete,
    onEdit,
    onColorChange,
    className,
  } = props;

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

  const createColorSubMenu = (option: SelectOption) => {
    return {
      key: "color-submenu",
      label: "修改颜色",
      children: SELECT_COLORS.map((color) => ({
        key: `color-${color}`,
        label: (
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded"
              style={{
                backgroundColor:
                  SELECT_COLORS_CONFIG[color][theme].backgroundColor,
              }}
            />
            <span className="capitalize">{color}</span>
          </div>
        ),
        onClick: (e: any) => {
          e.domEvent.stopPropagation();
          onColorChange?.(option, color);
        },
      })),
    };
  };

  const createDropdownMenu = (option: SelectOption) => {
    const menuItems = [];

    if (onEdit) {
      menuItems.push({
        key: "edit",
        label: "编辑选项",
        onClick: (e: any) => {
          e.domEvent.stopPropagation();
          setEditingId(option.id);
          setEditingValue(option.name);
        },
      });
    }

    if (onColorChange) {
      menuItems.push(createColorSubMenu(option));
    }

    if (onDelete) {
      menuItems.push({
        key: "delete",
        label: "删除",
        danger: true,
        onClick: (e: any) => {
          e.domEvent.stopPropagation();
          onDelete(option);
        },
      });
    }

    return { items: menuItems };
  };

  return (
    <div className={`flex flex-col gap-1 h-full ${className}`}>
      {options.map((option) => {
        const hasActions = onDelete || onColorChange || onEdit;

        if (!hasActions) {
          // 如果没有操作回调，直接渲染点击项
          return (
            <div
              key={option.id}
              className={classNames("cursor-pointer p-1 rounded-md", {
                "hover:bg-gray-100": theme !== "dark",
                "hover:bg-gray-900/50": theme === "dark",
              })}
              onClick={() => !editingId && onSelect?.(option)}
            >
              {editingId === option.id ? (
                <Input
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onPressEnter={() => handleEditComplete(option)}
                  onBlur={() => handleEditComplete(option)}
                  autoFocus
                  style={{
                    fontSize: "12px",
                    width: "fit-content",
                    minWidth: "60px",
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <div
                  style={{
                    width: "fit-content",
                    fontSize: "12px",
                    padding: "2px 4px",
                    borderRadius: "4px",
                    backgroundColor:
                      SELECT_COLORS_CONFIG[option.color][theme].backgroundColor,
                    color: SELECT_COLORS_CONFIG[option.color][theme].color,
                  }}
                >
                  {option.name}
                </div>
              )}
            </div>
          );
        }

        return (
          <div
            key={option.id}
            className={classNames(
              "flex items-center justify-between cursor-pointer p-1 rounded-md",
              {
                "hover:bg-gray-100": theme !== "dark",
                "hover:bg-gray-900/50": theme === "dark",
              },
            )}
            onClick={() => !editingId && onSelect?.(option)}
          >
            {editingId === option.id ? (
              <Input
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onPressEnter={() => handleEditComplete(option)}
                onBlur={() => handleEditComplete(option)}
                autoFocus
                style={{
                  fontSize: "12px",
                  width: "fit-content",
                  minWidth: "60px",
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div
                style={{
                  width: "fit-content",
                  fontSize: "12px",
                  padding: "2px 4px",
                  borderRadius: "4px",
                  backgroundColor:
                    SELECT_COLORS_CONFIG[option.color][theme].backgroundColor,
                  color: SELECT_COLORS_CONFIG[option.color][theme].color,
                }}
              >
                {option.name}
              </div>
            )}
            <Dropdown
              menu={createDropdownMenu(option)}
              trigger={["hover"]}
              placement="bottomRight"
            >
              <EllipsisOutlined onClick={(e) => e.stopPropagation()} />
            </Dropdown>
          </div>
        );
      })}
    </div>
  );
});

VerticalSelectList.displayName = "VerticalSelectList";

export default VerticalSelectList;
