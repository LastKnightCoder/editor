import { ContentDetailPage } from "../ContentDetailPage";
import { useDiaryStore } from "../../diary/store/useDiaryStore";
import { useAppContext } from "../../../app/AppContext";
import {
  createPageSchema,
  definePage,
  paramBoolean,
  paramNumber,
  paramOptional,
  paramString,
  useNavigator,
  usePage,
} from "../../../router";

const contentDetailSchema = createPageSchema({
  contentId: paramNumber(),
  contentTitle: paramString(""),
  contentType: paramString(""),
  refId: paramOptional(paramNumber()),
  fromDiary: paramOptional(paramBoolean()),
});
type ContentDetailParams = typeof contentDetailSchema.type;

function ContentDetailScreen() {
  const { params } = usePage<ContentDetailParams>();
  const navigator = useNavigator();
  const app = useAppContext();
  return (
    <ContentDetailPage
      contentId={params.contentId}
      contentTitle={params.contentTitle}
      contentType={params.contentType}
      refId={params.refId}
      onSaved={saved => {
        if (!params.fromDiary) {
          return;
        }
        useDiaryStore.getState().syncEntryContentByContentId({
          contentId: params.contentId,
          content: saved.content,
          wordCount: saved.count,
          updateTime: saved.updateTime,
        });
      }}
      onBack={() => navigator.goBack("ui")}
      onError={(error, fallback) => {
        app.presentError(error, fallback);
      }}
    />
  );
}

export default definePage({
  key: "contentDetail",
  // 同一内容详情在栈内只保留一份，重复打开 = 移到顶并刷新参数
  match: "params",
  getId: p => String(p.contentId),
  params: contentDetailSchema.schema,
  component: ContentDetailScreen,
});
