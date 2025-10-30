import useCalendarStore from "@/stores/useCalendarStore";
import { MdToday, MdChevronLeft, MdChevronRight } from "react-icons/md";
import { CalendarViewType } from "@/types";

const CalendarHeader = () => {
  const {
    currentView,
    currentDate,
    setCurrentView,
    goToToday,
    goToPrevious,
    goToNext,
  } = useCalendarStore();

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
    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-[#fff]/10 dark:bg-[var(--main-bg-color)]">
      <div className="flex items-center gap-4">
        <button
          onClick={goToToday}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <MdToday />
          今天
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevious}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-[#fff]/5"
          >
            <MdChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={goToNext}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-[#fff]/5"
          >
            <MdChevronRight className="h-5 w-5" />
          </button>
        </div>

        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {formatCurrentDate()}
        </h2>
      </div>

      {/* 右侧：视图切换 */}
      <div className="flex rounded-lg border border-gray-300 dark:border-[#fff]/10">
        {(["day", "week", "month", "agenda"] as CalendarViewType[]).map(
          (view) => (
            <button
              key={view}
              onClick={() => setCurrentView(view)}
              className={`px-4 py-2 text-sm font-medium ${
                currentView === view
                  ? "bg-indigo-400 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-[#fff]/10 dark:text-gray-300 dark:hover:bg-[#fff]/5"
              } ${view === "day" ? "rounded-l-lg" : ""} ${view === "agenda" ? "rounded-r-lg" : ""}`}
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
