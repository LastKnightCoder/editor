import { memo } from "react";
import { CloseOutlined } from "@ant-design/icons";
import { SelectOption } from "../types";
import { SELECT_COLORS_CONFIG } from "../constants";

interface SelectListProps {
  options: SelectOption[];
  theme: "light" | "dark";
  onSelect?: (option: SelectOption) => void;
  onClear?: (id: string) => void;
  className?: string;
}

const SelectList = memo((props: SelectListProps) => {
  const { options, theme, onSelect, onClear, className } = props;

  return (
    <div
      className={`flex flex-nowrap flex-nowrap items-center gap-1 h-full ${className}`}
    >
      {options.map((option) => {
        return (
          <div
            key={option.id}
            style={{
              width: "fit-content",
              flex: "none",
              fontSize: "12px",
              padding: "2px 4px",
              borderRadius: "4px",
              backgroundColor:
                SELECT_COLORS_CONFIG[option.color][theme].backgroundColor,
              color: SELECT_COLORS_CONFIG[option.color][theme].color,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
            onClick={() => onSelect?.(option)}
          >
            <span>{option.name}</span>
            {onClear && (
              <button
                type="button"
                className="w-3 h-3 rounded-full flex items-center justify-center cursor-pointer hover:bg-red-500/20"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear?.(option.id);
                }}
              >
                <CloseOutlined className="w-2 h-2" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
});

SelectList.displayName = "SelectList";

export default SelectList;
