import { DiaryHomePage } from "../DiaryHomePage";
import { useDiaryStore } from "../store/useDiaryStore";
import { describeDiaryPeriod, getBaseDateFromDiaryKey } from "../dateKey";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator } from "../../../router";

function DiaryHomeScreen() {
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <DiaryHomePage
      onOpenEditor={(mode, baseDate) => {
        void (async () => {
          try {
            const contentId = await useDiaryStore.getState().openAt(mode, baseDate);
            if (typeof contentId !== "number" || !Number.isFinite(contentId) || contentId <= 0) {
              throw new Error("DIARY_CONTENT_NOT_FOUND");
            }
            navigator.push("contentDetail", {
              contentId,
              contentTitle: "",
              fromDiary: true,
              diaryDate: describeDiaryPeriod(mode, baseDate),
            });
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
