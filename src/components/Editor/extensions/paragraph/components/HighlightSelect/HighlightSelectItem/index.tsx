import { memo, useEffect, useRef } from "react";
import classnames from "classnames";
import { Ban } from "lucide-react";

interface IHighlightSelectItemProps {
  label?: string;
  bgColor: string;
  onClick: (label: string | undefined) => void;
}

const HighlightSelectItem = memo((props: IHighlightSelectItemProps) => {
  const { label, bgColor, onClick } = props;

  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!itemRef.current) return;

    const handleClick = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onClick(label);
    };

    itemRef.current.addEventListener("click", handleClick);

    return () => {
      itemRef.current?.removeEventListener("click", handleClick);
    };
  }, [label, onClick]);

  const isDefault = !label;

  return (
    <div
      ref={itemRef}
      className={classnames(
        "w-6 h-6 rounded-md cursor-pointer flex items-center justify-center transition-all duration-200 hover:scale-110",
        isDefault
          ? "border border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 bg-transparent text-gray-400"
          : "hover:shadow-sm",
      )}
      style={{ backgroundColor: isDefault ? "transparent" : bgColor }}
      title={label}
    >
      {isDefault && <Ban size={14} />}
    </div>
  );
});

export default HighlightSelectItem;
