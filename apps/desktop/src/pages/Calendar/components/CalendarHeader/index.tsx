import useCalendarStore from "@/stores/useCalendarStore";
import { MdToday, MdChevronLeft, MdChevronRight } from "react-icons/md";
import { CalendarViewType } from "@/types";
import useThemeColors from "@/hooks/useThemeColors";
import classNames from "classnames";

const CalendarHeader = () => {
  const {
    currentView,
    currentDate,
    setCurrentView,
    goToToday,
    goToPrevious,
    goToNext,
  } = useCalendarStore();
  const themeColors = useThemeColors();

  const formatCurrentDate = () => {
    const date = new Date(currentDate);
    if (currentView === "day") {
      return date.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } else if (currentView === "week") {
      return `${date.getFullYear()}年 第${Math.ceil((date.getDate() + new Date(date.getFullYear(), date.getMonth(), 1).getDay()) / 7)}周`;
    } else if (currentView === "agenda") {
      return date.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
      });
    } else {
      return date.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
      });
    }
  };

  return (
    <div
      className={classNames(
        "flex items-center justify-between border-b px-6 py-4 transition-colors",
        // 移除背景色，保持透明以显示底层背景，或者使用更通用的背景
        themeColors.borderClass,
      )}
    >
      <div className="flex items-center gap-4">
        <button
          onClick={goToToday}
          className={classNames(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors shadow-sm hover:shadow-md",
            themeColors.buttonBg,
            themeColors.buttonTextClass,
          )}
        >
          <MdToday />
          今天
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevious}
            className={classNames(
              "rounded-lg p-2 transition-colors",
              themeColors.hoverClass,
            )}
          >
            <MdChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={goToNext}
            className={classNames(
              "rounded-lg p-2 transition-colors",
              themeColors.hoverClass,
            )}
          >
            <MdChevronRight className="h-5 w-5" />
          </button>
        </div>

        <h2
          className={classNames(
            "text-xl font-semibold transition-colors",
            themeColors.activeTextClass,
          )}
        >
          {formatCurrentDate()}
        </h2>
      </div>

      {/* 右侧：视图切换 */}
      <div
        className={classNames(
          "flex rounded-lg border p-0.5 transition-colors",
          themeColors.borderClass,
          themeColors.cardBgClass,
        )}
      >
        {(["day", "week", "month", "agenda"] as CalendarViewType[]).map(
          (view) => (
            <button
              key={view}
              onClick={() => setCurrentView(view)}
              className={classNames(
                "px-4 py-2 text-sm font-medium transition-all rounded-md",
                currentView === view
                  ? [themeColors.activeClass, themeColors.activeTextClass]
                  : [themeColors.textClass, themeColors.hoverClass],
              )}
            >
              {view === "day"
                ? "日"
                : view === "week"
                  ? "周"
                  : view === "month"
                    ? "月"
                    : "时间轴"}
            </button>
          ),
        )}
      </div>
    </div>
  );
};

export default CalendarHeader;
