// 日记主页路由。
// 产品设计（重要，勿回退）：日记是「朋友圈式」的，一天可以发多条，每条就是一个
// segment。顶部输入条「记下今天的想法…」是发新日记的入口——即使当天已有日记，
// 也必须新建 segment（当天最新片段为空时由 store 复用空片段，避免连发空日记），
// 绝不能打开当天已有那篇继续写；日历选日期才是「查看/续写那天」的入口。
import { DiaryHomePage } from "../DiaryHomePage";
import { useDiaryStore } from "../store/useDiaryStore";
import { describeDiaryPeriod, getBaseDateFromDiaryKey } from "../dateKey";
import { getTodayDateKey } from "../feedUtils";
import type { DiaryType } from "../../../types";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator } from "../../../router";

function DiaryHomeScreen() {
  const navigator = useNavigator();
  const app = useAppContext();

  const openContentDetail = (contentId: number | null, mode: DiaryType, baseDate: string) => {
    if (typeof contentId !== "number" || !Number.isFinite(contentId) || contentId <= 0) {
      throw new Error("DIARY_CONTENT_NOT_FOUND");
    }
    navigator.push("contentDetail", {
      contentId,
      contentTitle: "",
      fromDiary: true,
      diaryDate: describeDiaryPeriod(mode, baseDate),
    });
  };

  return (
    <DiaryHomePage
      onComposeToday={() => {
        void (async () => {
          try {
            // 发新日记：新建今天的 segment，而非打开当天已有日记
            const today = getTodayDateKey();
            const contentId = await useDiaryStore.getState().startNewSegment("daily", today);
            openContentDetail(contentId, "daily", today);
          } catch (error) {
            app.presentError(error, "打开日记失败");
          }
        })();
      }}
      onOpenEditor={(mode, baseDate) => {
        void (async () => {
          try {
            const contentId = await useDiaryStore.getState().openAt(mode, baseDate);
            openContentDetail(contentId, mode, baseDate);
          } catch (error) {
            app.presentError(error, "打开日记失败");
          }
        })();
      }}
      onOpenSegment={(entry, segment) => {
        // 片段独立编辑：store 定位到该片段，编辑器按 segment.contentId 直达
        void useDiaryStore.getState().jumpToEntry(entry, segment.id);
        navigator.push("contentDetail", {
          contentId: segment.contentId,
          contentTitle: "",
          fromDiary: true,
          diaryDate: describeDiaryPeriod(
            entry.type,
            getBaseDateFromDiaryKey(entry.type, entry.date)
          ),
        });
      }}
      onError={(error, fallback) => {
        app.presentError(error, fallback);
      }}
    />
  );
}

export default definePage({
  key: "diaryHome",
  match: "single",
  params: {},
  component: DiaryHomeScreen,
});
