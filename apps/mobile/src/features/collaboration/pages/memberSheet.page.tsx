// 成员管理（设计稿 04 方案 B）：overlay 层浮层，协作码卡置顶。
import { lazy, Suspense } from "react";
import { useAppContext } from "../../../app/AppContext";
import { createPageSchema, definePage, paramString, useNavigator, usePage } from "../../../router";
import { CollaborationLoading } from "../components/CollaborationLoading";
import { useCollaborationRuntime } from "../hooks/useCollaborationRuntime";

const MemberManageSheet = lazy(() =>
  import("../MemberManageSheet").then(module => ({ default: module.MemberManageSheet }))
);

const memberSheetSchema = createPageSchema({ documentId: paramString() });
type MemberSheetParams = typeof memberSheetSchema.type;

function MemberSheetScreen() {
  const { params } = usePage<MemberSheetParams>();
  const navigator = useNavigator();
  const app = useAppContext();
  useCollaborationRuntime();
  return (
    <Suspense fallback={<CollaborationLoading />}>
      <MemberManageSheet
        documentId={params.documentId}
        onClose={() => void navigator.goBack("ui")}
        // 结束共享/退出协作：在 Sheet 内完成 leave 后把结果回传给推入方；
        // 普通返回由 backDismiss=false 透传到路由，pushForResult 会按 dismissed 收尾。
        onExit={() => navigator.finish("ended")}
        onError={(error, fallback) => app.presentError(error, fallback)}
      />
    </Suspense>
  );
}

export default definePage({
  key: "memberSheet",
  layer: "overlay",
  match: "params",
  getId: params => params.documentId,
  params: memberSheetSchema.schema,
  component: MemberSheetScreen,
});
