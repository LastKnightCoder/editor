// 协作编辑页（设计稿 03 方案 A）：顶栏 presence + 状态副行 + 离线横幅 + 协作编辑器。
// 远端光标/选区由 @tau/editor 的 withCollaboration + Cursors 自动渲染，本页只负责外壳与状态。
// 成员视角（本地无内容行）与协作中心入口仍走本页；owner 的原地编辑见详情页 CollaborativeEditor。
import { useRef, useState } from "react";
import {
  ChevronRight,
  Loader2,
  LogOut,
  MoreHorizontal,
  RefreshCw,
  Unlink,
  Users,
  WifiOff,
} from "lucide-react";
import { Editor, type EditorRef } from "@tau/editor/src";
import { ActionSheet } from "../../components/ActionSheet";
import { PageHeader, PageHeaderButton } from "../../components/PageHeader";
import { useMobileTheme } from "../../hooks/useMobileTheme";
import { useNavigator } from "../../router";
import { mobileCardPreviewExtensions } from "../cards/editorExtensions";
import { MobileEditorBottomToolbar } from "../cards/editorToolbar/MobileEditorBottomToolbar";
import { useMobileEditorToolbarController } from "../cards/editorToolbar/useMobileEditorToolbarController";
import { AvatarStack, StatusDot } from "./components/CollaborationUI";
import { useCollabSession } from "./hooks/useCollabSession";

export function CollabEditorPage(props: {
  documentId: string;
  onBack: () => void;
  onExit: () => void;
}) {
  const navigator = useNavigator();
  const { theme } = useMobileTheme();
  const [moreOpen, setMoreOpen] = useState(false);
  const { binding, session, loading, error, readonly, presence, status, online, offline, retry } =
    useCollabSession(props.documentId);
  const editorRef = useRef<EditorRef | null>(null);
  const toolbarController = useMobileEditorToolbarController({ editorRef });
  // 工具条经 portal 挂进本页根容器，才能随页面转场动画一起平移、退场
  const [pageRootEl, setPageRootEl] = useState<HTMLDivElement | null>(null);

  return (
    <div ref={setPageRootEl} className="bg-page flex h-full flex-col">
      <PageHeader
        onBack={props.onBack}
        center={
          <div className="min-w-0">
            <div className="text-ink truncate text-[16px] font-extrabold">
              {session?.title ?? "协作文档"}
            </div>
            <div className="text-ink-2 mt-px flex items-center justify-center gap-1 text-[10.5px]">
              <StatusDot tone={status?.tone ?? "idle"} />
              <span className={status?.tone === "offline" ? "text-warn" : undefined}>
                {status?.label ?? "连接中"}
                {online.length > 0 ? ` · ${online.length} 人` : ""}
              </span>
            </div>
          </div>
        }
        actions={
          <>
            <button
              type="button"
              aria-label="成员管理"
              onClick={() => navigator.push("memberSheet", { documentId: props.documentId })}
              className="bg-surface shadow-card active:bg-press flex h-9 items-center gap-1 rounded-full py-1 pl-1.5 pr-2.5 transition-colors"
            >
              <AvatarStack members={online} />
              <ChevronRight size={14} className="text-ink-3" />
            </button>
            <PageHeaderButton
              icon={<MoreHorizontal size={20} />}
              aria-label="更多操作"
              onClick={() => setMoreOpen(true)}
            />
          </>
        }
      />

      {offline ? (
        <div className="bg-butter-soft text-warn flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-semibold">
          <WifiOff size={15} className="shrink-0" />
          <span className="flex-1">
            {status?.label ?? "网络已断开"} · 改动保留在本机，恢复后自动同步
          </span>
        </div>
      ) : null}

      <div className="edge-fade-scroll mobile-floating-toolbar-scroll flex-1 overflow-y-auto px-5">
        {loading && !binding ? (
          <div
            role="status"
            className="text-ink-3 flex min-h-[45vh] items-center justify-center gap-2"
          >
            <Loader2 size={18} className="animate-spin" />
            <span className="text-[13px]">正在加载协作内容…</span>
          </div>
        ) : null}

        {!loading && !binding ? (
          <div className="flex min-h-[45vh] flex-col items-center justify-center px-8 text-center">
            <p className="text-ink text-[15px] font-bold">无法打开协作文档</p>
            <p className="text-ink-2 mt-2 text-[12.5px] leading-relaxed">
              {error || session?.error || "文档不存在或你已失去访问权限"}
            </p>
            <button
              type="button"
              onClick={retry}
              className="bg-surface shadow-card mt-5 flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-bold active:opacity-70"
            >
              <RefreshCw size={13} strokeWidth={2.6} />
              重试
            </button>
          </div>
        ) : null}

        {binding ? (
          <div className="min-h-[45vh] pt-2">
            <Editor
              ref={editorRef}
              key={`collab-${props.documentId}`}
              collaboration={binding}
              className="mobile-card-editor-content"
              readonly={readonly}
              theme={theme}
              extensions={mobileCardPreviewExtensions}
              onFocus={() => {
                presence.onFocus();
                toolbarController.handleEditorFocus();
              }}
              onBlur={() => {
                presence.onBlur();
                toolbarController.handleEditorBlur();
              }}
              onChange={toolbarController.syncSelection}
              onSelectionChange={toolbarController.syncSelection}
            />
          </div>
        ) : null}

        {error && binding ? (
          <p className="text-rose mt-4 text-[12px] leading-relaxed">{error}</p>
        ) : null}
      </div>

      <MobileEditorBottomToolbar
        controller={toolbarController}
        portalContainer={pageRootEl}
        readonly={readonly}
      />

      <ActionSheet
        open={moreOpen}
        title={session?.title ?? "协作文档"}
        kind="协作"
        subtitle={
          session ? `${session.members.length} 位成员 · ${online.length} 人在线` : undefined
        }
        items={[
          {
            label: "成员管理",
            icon: <Users size={18} />,
            tone: "sage",
            trailing: (
              <>
                {session ? `${session.members.length} 人` : null}
                <ChevronRight strokeWidth={2} />
              </>
            ),
            onClick: () => navigator.push("memberSheet", { documentId: props.documentId }),
          },
          {
            label: session?.role === "owner" ? "结束共享" : "退出协作",
            desc:
              session?.role === "owner"
                ? "所有成员将失去访问权限，云端数据被清空"
                : "退出后需重新申请才能加入",
            danger: true,
            icon: session?.role === "owner" ? <Unlink size={18} /> : <LogOut size={18} />,
            onClick: props.onExit,
          },
        ]}
        onClose={() => setMoreOpen(false)}
      />
    </div>
  );
}
