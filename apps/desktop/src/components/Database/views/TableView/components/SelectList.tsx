import { memo } from "react";
import { SelectOption } from "../../../types";
import { Tag } from "@tau/ui";

interface SelectListProps {
  options: SelectOption[];
  onSelect?: (option: SelectOption) => void;
  onClear?: (id: string) => void;
  className?: string;
}

const SelectList = memo((props: SelectListProps) => {
  const { options, onSelect, onClear, className } = props;

  if (options.length === 0) {
    return null;
  }

  return (
    <div className={`flex h-full flex-nowrap items-center gap-1 ${className}`}>
      {options.map(option => {
        return (
          <Tag
            key={option.id}
            color={option.color}
            onClick={onSelect ? () => onSelect(option) : undefined}
            onRemove={onClear ? () => onClear(option.id) : undefined}
          >
            {option.name}
          </Tag>
        );
      })}
    </div>
  );
});

SelectList.displayName = "SelectList";

export default SelectList;
