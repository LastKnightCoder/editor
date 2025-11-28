import { memo } from "react";
import classNames from "classnames";
import { MdAdd } from "react-icons/md";
import useThemeColors from "@/hooks/useThemeColors";

interface SidebarHeaderProps {
  onCreate: () => void;
}

const SidebarHeader = memo(({ onCreate }: SidebarHeaderProps) => {
  const themeColors = useThemeColors();

  return (
    <div className="flex items-center justify-between p-5 pb-2 select-none">
      <span
        className={classNames("text-[16px] font-bold", themeColors.textClass)}
      >
        问题分类
      </span>
      <button
        className={classNames(
          "text-base rounded-full p-1 cursor-pointer",
          themeColors.hoverClass,
        )}
        onClick={onCreate}
        title="新建分组"
      >
        <MdAdd />
      </button>
    </div>
  );
});

SidebarHeader.displayName = "SidebarHeader";

export default SidebarHeader;
