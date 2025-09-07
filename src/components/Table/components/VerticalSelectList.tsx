import { SelectOption } from "../types";
import { SELECT_COLORS_CONFIG } from "../constants";
import classNames from "classnames";

interface VerticalSelectListProps {
  options: SelectOption[];
  theme: "light" | "dark";
  onSelect?: (option: SelectOption) => void;
  className?: string;
}

const VerticalSelectList = (props: VerticalSelectListProps) => {
  const { options, theme, onSelect, className } = props;

  if (options.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-col gap-1 h-full ${className}`}>
      {options.map((option) => {
        return (
          <div
            key={option.id}
            className={classNames("cursor-pointer p-1 rounded-md", {
              "hover:bg-gray-100": theme !== "dark",
              "hover:bg-gray-900/50": theme === "dark",
            })}
            onClick={() => onSelect?.(option)}
          >
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
          </div>
        );
      })}
    </div>
  );
};

export default VerticalSelectList;
