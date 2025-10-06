import { memo } from "react";
import classNames from "classnames";
import { MdAdd } from "react-icons/md";

interface SidebarHeaderProps {
  onCreate: () => void;
}

const SidebarHeader = memo(({ onCreate }: SidebarHeaderProps) => {
  return (
    <div className="flex items-center justify-between p-5 pb-2 select-none">
      <span className="text-[16px] font-bold text-gray-600 dark:text-gray-400">
        问题分类
      </span>
      <button
        className={classNames(
          "text-base rounded-full p-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800",
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
