import { useRef, memo } from "react";
import classNames from "classnames";
import { MdAdd } from "react-icons/md";
import EditText, { EditTextHandle } from "@/components/EditText";
import SearchInput from "@/components/SearchInput";
import useThemeColors from "@/hooks/useThemeColors";

export type QuestionFilter =
  | "all"
  | "answered"
  | "unanswered"
  | "not_started"
  | "in_progress"
  | "resolved";

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
    const themeColors = useThemeColors();
    const titleRef = useRef<EditTextHandle>(null);

    const options = [
      {
        label: "全部",
        value: "all" as const,
        active: filter === "all",
      },
      {
        label: "未开始",
        value: "not_started" as const,
        active: filter === "not_started",
      },
      {
        label: "进行中",
        value: "in_progress" as const,
        active: filter === "in_progress",
      },
      {
        label: "已解决",
        value: "resolved" as const,
        active: filter === "resolved",
      },
    ];

    return (
      <div className="flex flex-col gap-2 mt-5">
        <div className="flex items-center px-5 gap-2">
          <EditText
            ref={titleRef}
            defaultValue={groupTitle}
            onChange={onGroupTitleChange}
            contentEditable={!isDefault}
            className={classNames(
              "flex-1 min-w-0 text-lg font-bold",
              themeColors.textClass,
            )}
          />
          <div className="relative w-48 flex justify-end flex-shrink-0">
            <SearchInput
              value={searchQuery}
              onChange={onSearch}
              placeholder="搜索问题..."
              alwaysExpanded={true}
            />
          </div>
          <button
            className={classNames(
              "p-1.5 rounded-full cursor-pointer flex items-center justify-center flex-shrink-0",
              themeColors.hoverTextClass,
              themeColors.hoverClass,
            )}
            onClick={onCreateQuestion}
            title="新建问题"
          >
            <MdAdd size={20} />
          </button>
        </div>
        <div
          className={classNames(
            "flex px-5 pb-3 border-b",
            themeColors.borderClass,
          )}
        >
          <div
            className={classNames(
              "text-[12px]",
              themeColors.secondaryTextClass,
            )}
          >
            {totalCount} questions
          </div>
          <div className="flex items-center ml-auto gap-2">
            {options.map((option) => (
              <div
                key={option.value}
                className={classNames(
                  "text-[10px] px-[6px] py-[2px] cursor-pointer rounded-full transition-colors",
                  themeColors.secondaryTextClass,
                  {
                    [classNames(
                      themeColors.buttonBg,
                      themeColors.buttonTextClass,
                    )]: option.active,
                  },
                )}
                onClick={() => onFilterChange(option.value)}
              >
                {option.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  },
);

Toolbar.displayName = "Toolbar";

export default Toolbar;
