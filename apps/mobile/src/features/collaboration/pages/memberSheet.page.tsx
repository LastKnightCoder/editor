// 成员管理（设计稿 04 方案 B）：overlay 层浮层，协作码卡置顶。
import { lazy, Suspense } from "react";
import { useAppContext } from "../../../app/AppContext";
import { createPageSchema, definePage, paramString, useBackHandler, useNavigator, usePage } from "../../../router";
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
  // 容器已关掉内置返回拦截（见 MemberManageSheet）：返回手势在此表达为 cancel，
  // 让 pushForResult 的等待方以 dismissed 收尾并弹栈
  useBackHandler(() => {
    navigator.cancel();
    return true;
  });
  return (
    <Suspense fallback={<CollaborationLoading />}>
      <MemberManageSheet
        documentId={params.documentId}
        onClose={() => void navigator.goBack("ui")}
        // 结束共享/退出协作：在 Sheet 内完成 leave 后把结果回传给推入方
        //（详情页据此直接退出协作态，不必等下次重查绑定）；普通关闭不回传结果
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
