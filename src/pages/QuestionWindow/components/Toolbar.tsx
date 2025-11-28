import { useRef, memo } from "react";
import classNames from "classnames";
import { MdAdd } from "react-icons/md";
import EditText, { EditTextHandle } from "@/components/EditText";
import useTheme from "@/hooks/useTheme";
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
    const { isDark } = useTheme();
    const themeColors = useThemeColors();
    const titleRef = useRef<EditTextHandle>(null);
    const searchRef = useRef<EditTextHandle>(null);

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
        <div className="flex items-center px-5">
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
          <button
            className={classNames(
              "ml-2 p-1.5 rounded-full cursor-pointer flex items-center justify-center",
              themeColors.hoverTextClass,
              themeColors.hoverClass,
            )}
            onClick={onCreateQuestion}
            title="新建问题"
          >
            <MdAdd size={20} />
          </button>
        </div>
        <div className="flex px-5">
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
        <div
          className={classNames(
            "mt-3 py-3 mx-5 px-0 flex items-center border-b",
            themeColors.borderClass,
          )}
        >
          <EditText
            ref={searchRef}
            placeholder="搜索问题..."
            placeholderStyle={{
              color: isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.6)",
            }}
            defaultValue={searchQuery}
            onChange={onSearch}
            onPressEnter={() => {
              onSearch(searchRef.current?.getValue() || "");
            }}
            contentEditable={true}
            className={classNames("flex-1 min-w-0", themeColors.textClass)}
          />
        </div>
      </div>
    );
  },
);

Toolbar.displayName = "Toolbar";

export default Toolbar;
