// 协作编辑页（设计稿 03 方案 A）：screen 层，按 documentId 去重，同一文档只保留一份编辑实例。
import { lazy, Suspense, useEffect, useState } from "react";
import { useAppContext } from "../../../app/AppContext";
import { MobileConfirmDialog } from "../../../components/MobileConfirmDialog";
import { createPageSchema, definePage, paramString, useNavigator, usePage } from "../../../router";
import { useCollaborationStore } from "../core/store";
import { CollaborationLoading } from "../components/CollaborationLoading";
import { leaveCollabText, runLeaveCollab } from "../leaveCollab";
import { useCollaborationRuntime } from "../hooks/useCollaborationRuntime";

const CollabEditorPage = lazy(() =>
  import("../CollabEditorPage").then(module => ({ default: module.CollabEditorPage }))
);

const collabEditorSchema = createPageSchema({ documentId: paramString() });
type CollabEditorParams = typeof collabEditorSchema.type;

function CollabEditorScreen() {
  const { params } = usePage<CollabEditorParams>();
  const navigator = useNavigator();
  const app = useAppContext();
  const session = useCollaborationStore(state =>
    state.sessions.find(item => item.id === params.documentId)
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sessionEverSeen, setSessionEverSeen] = useState(false);
  const isOwner = session?.role === "owner";
  useCollaborationRuntime();

  // 会话就绪后消失（退出 / 被撤权 / 被结束）统一退栈：无论从协作中心、
  // 详情页发起结果卡还是成员管理进入，goBack 都回到合理的上一层
  useEffect(() => {
    if (session) {
      setSessionEverSeen(true);
      return;
    }
    if (sessionEverSeen && !busy) void navigator.goBack("code");
  }, [session, sessionEverSeen, busy, navigator]);

  const exit = async () => {
    setBusy(true);
    try {
      // 动态引入：本页由 eager glob 注册，静态引用会把协作运行时拖进主 bundle
      const { collaborationManager } = await import("../core/manager");
      await runLeaveCollab(
        documentId => collaborationManager.leave(documentId),
        params.documentId,
        isOwner
      );
    } catch (error) {
      app.presentError(error, leaveCollabText(isOwner).errorTitle);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const text = leaveCollabText(isOwner);
  return (
    <>
      <Suspense fallback={<CollaborationLoading />}>
        <CollabEditorPage
          documentId={params.documentId}
          onBack={() => void navigator.goBack("ui")}
          onExit={() => setConfirming(true)}
        />
      </Suspense>
      <MobileConfirmDialog
        open={confirming}
        danger
        loading={busy}
        title={text.title}
        description={text.description}
        confirmText={text.confirmText}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void exit()}
      />
    </>
  );
}

export default definePage({
  key: "collabEditor",
  match: "params",
  getId: params => params.documentId,
  params: collabEditorSchema.schema,
  component: CollabEditorScreen,
});
