import { DiaryHomePage } from "../DiaryHomePage";
import { useDiaryStore } from "../store/useDiaryStore";
import { formatDiaryPeriodLabel } from "../dateKey";
import { useAppContext } from "../../../app/AppContext";
import { definePage, useNavigator } from "../../../router";

function DiaryHomeScreen() {
  const navigator = useNavigator();
  const app = useAppContext();

  return (
    <DiaryHomePage
      onBack={() => navigator.goBack("ui")}
      onOpenEditor={(mode, baseDate) => {
        void (async () => {
          try {
            const contentId = await useDiaryStore.getState().openAt(mode, baseDate);
            if (typeof contentId !== "number" || !Number.isFinite(contentId) || contentId <= 0) {
              throw new Error("DIARY_CONTENT_NOT_FOUND");
            }
            const contentType = mode === "daily" ? "日记" : mode === "weekly" ? "周记" : "月记";
            navigator.push("contentDetail", {
              contentId,
              contentTitle: formatDiaryPeriodLabel(mode, baseDate),
              contentType,
              fromDiary: true,
            });
          } catch (error) {
            app.presentError(error, "打开日记失败");
          }
        })();
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
