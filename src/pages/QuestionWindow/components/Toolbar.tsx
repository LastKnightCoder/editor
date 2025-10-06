import { useRef, memo } from "react";
import classNames from "classnames";
import { MdAdd } from "react-icons/md";
import EditText, { EditTextHandle } from "@/components/EditText";
import useTheme from "@/hooks/useTheme";

export type QuestionFilter = "all" | "answered" | "unanswered";

interface ToolbarProps {
  groupTitle: string;
  isDefault: boolean;
  totalCount: number;
  filter: QuestionFilter;
  searchQuery: string;
  onGroupTitleChange: (title: string) => void;
  onFilterChange: (f: QuestionFilter) => void;
  onSearch: (q: string) => void;
  onCreateQuestion: () => void;
}

const Toolbar = memo(
  ({
    groupTitle,
    isDefault,
    totalCount,
    filter,
    searchQuery,
    onGroupTitleChange,
    onFilterChange,
    onSearch,
    onCreateQuestion,
  }: ToolbarProps) => {
    const { isDark } = useTheme();
    const titleRef = useRef<EditTextHandle>(null);
    const searchRef = useRef<EditTextHandle>(null);

    const options = [
      {
        label: "全部",
        value: "all" as const,
        active: filter === "all",
      },
      {
        label: "已回答",
        value: "answered" as const,
        active: filter === "answered",
      },
      {
        label: "未回答",
        value: "unanswered" as const,
        active: filter === "unanswered",
      },
    ];

    return (
      <div className="flex flex-col gap-2 mt-5">
        <div className="flex items-center px-5">
          <EditText
            ref={titleRef}
            defaultValue={groupTitle}
            onChange={onGroupTitleChange}
            contentEditable={!isDefault}
            className="flex-1 min-w-0 text-lg font-bold text-[#455963] dark:text-gray-400"
          />
          <button
            className={classNames(
              "ml-2 p-1.5 rounded-full cursor-pointer flex items-center justify-center",
              isDark
                ? "text-gray-400 hover:text-gray-300 hover:bg-white/10"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-500/10",
            )}
            onClick={onCreateQuestion}
            title="新建问题"
          >
            <MdAdd size={20} />
          </button>
        </div>
        <div className="flex px-5">
          <div className="text-[12px] text-gray-500">
            {totalCount} questions
          </div>
          <div className="flex items-center ml-auto gap-2">
            {options.map((option) => (
              <div
                key={option.value}
                className={classNames(
                  "text-[10px] text-[#8a9ca5] px-[6px] py-[2px] cursor-pointer rounded-full",
                  {
                    "bg-[#7996a5] text-gray-100": option.active,
                  },
                )}
                onClick={() => onFilterChange(option.value)}
              >
                {option.label}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 py-3 mx-5 px-0 flex items-center border-b border-[#e2e4ea] dark:border-[#455963]">
          <EditText
            ref={searchRef}
            placeholder="搜索问题..."
            placeholderStyle={{
              color: isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.6)",
            }}
            defaultValue={searchQuery}
            onChange={onSearch}
            contentEditable={true}
            className="text-[#455963] dark:text-[#8a9ca5] flex-1 min-w-0"
          />
        </div>
      </div>
    );
  },
);

Toolbar.displayName = "Toolbar";

export default Toolbar;
