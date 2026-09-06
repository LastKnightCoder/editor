import { useEffect, useState } from "react";
import { App } from "antd";
import { ExternalLink, KeyRound } from "lucide-react";
import type { CollaborationSession } from "@tau/collaboration";
import useCollaborationStore, {
  initializeCollaborationStore,
} from "@/stores/useCollaborationStore";
import useSettingStore from "@/stores/useSettingStore";
import useTabStore from "@/stores/useTabStore";
import { TabType } from "@/types/tab";
import { invoke } from "@/electron";
import { findOneArticle, getCardById, getProjectItemById, getDocumentItem } from "@/commands";
import { openArticleInNewWindow } from "@/commands/article";
import { openCardInNewWindow } from "@/commands/card";
import { openProjectItemInNewWindow } from "@/commands/project";
import { openDocumentItemInNewWindow } from "@/commands/document";
import ContentCollaborationControl from "@/components/ContentCollaborationControl";
import CustomModal from "@/components/CustomModal";
import RichTextEditModal from "@/components/RichTextEditModal";
import { sessionStatus } from "@/pages/CollaborationView/session-status";
import { StatusDot } from "@/components/CollaborationUI";

export default function CollaborationPanel() {
  const { sessions, requests, select } = useCollaborationStore();
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [contentId, setContentId] = useState<number>();
  const { message } = App.useApp();
  useEffect(() => initializeCollaborationStore(), []);
  const openCenter = (id?: string) => {
    select(id);
    useTabStore.getState().openInNewTab(TabType.Collaboration);
  };
  const openSession = async (session: CollaborationSession) => {
    const source = session.source;
    if (!source) {
      openCenter(session.id);
      return;
    }
    const currentDatabase = useSettingStore.getState().setting.database.active;
    const id = source.sourceId;
    const type = source.sourceType;
    if (currentDatabase !== source.databaseName) {
      if (id && type === "article") {
        openArticleInNewWindow(source.databaseName, id);
        return;
      }
      if (id && type === "card") {
        openCardInNewWindow(source.databaseName, id);
        return;
      }
      if (id && type === "project-item") {
        openProjectItemInNewWindow(source.databaseName, id);
        return;
      }
      if (id && type === "document-item") {
        openDocumentItemInNewWindow(source.databaseName, id);
        return;
      }
      openCenter(session.id);
      return;
    }
    try {
      const tabs = useTabStore.getState();
      if (id && type === "article" && (await findOneArticle(id))) {
        tabs.openInNewTab(TabType.ArticleDetail, { id });
        return;
      }
      if (id && type === "card" && (await getCardById(id))) {
        tabs.openInNewTab(TabType.CardDetail, { id });
        return;
      }
      if (id && type === "project-item") {
        const item = await getProjectItemById(id);
        if (item?.projects[0]) {
          tabs.openInNewTab(TabType.ProjectDetail, { id: item.projects[0], itemId: id });
          return;
        }
      }
      if (id && type === "document-item") {
        const item = await getDocumentItem(id);
        if (item?.documents[0]) {
          tabs.openInNewTab(TabType.DocumentDetail, { id: item.documents[0], itemId: id });
          return;
        }
      }
      setContentId(source.contentId);
    } catch {
      openCenter(session.id);
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span className="text-text-3 min-w-0 truncate text-xs">
          {sessions.length} 项共享
          {requests.length ? ` · ${requests.length} 待审批` : ""}
        </span>
        <div className="flex flex-none gap-1">
          <button
            type="button"
            className="hover:bg-hover hover:text-text-1 text-text-2 inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1.5 text-[11px] transition duration-150"
            aria-label="输入协作码加入"
            title="输入协作码加入"
            onClick={() => setJoinOpen(true)}
          >
            <KeyRound size={13} />
            加入
          </button>
          <button
            type="button"
            className="hover:bg-hover hover:text-text-1 text-text-2 inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1.5 text-[11px] transition duration-150"
            aria-label="打开协作中心"
            title="打开协作中心"
            onClick={() => openCenter()}
          >
            <ExternalLink size={13} />
            协作中心
          </button>
        </div>
      </div>
      {sessions.length === 0 ? (
        <button
          type="button"
          className="text-text-3 hover:bg-hover hover:text-text-2 -mx-1 cursor-pointer rounded-lg border-0 bg-transparent px-2 pb-2 pt-3.5 text-left text-xs leading-relaxed transition duration-150"
          onClick={() => openCenter()}
        >
          暂无共享内容。点击此处打开协作中心，或点右上角「加入」输入协作码。
        </button>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {sessions.map(session => {
            const status = sessionStatus(session);
            return (
              <li
                key={session.id}
                className="border-border-2 flex items-center gap-0.5 border-b py-1.5 last:border-b-0"
              >
                <button
                  type="button"
                  className="hover:bg-hover -ml-1 flex min-w-0 flex-1 cursor-pointer flex-col gap-[3px] rounded-[7px] border-0 bg-transparent px-1 py-0.5 text-left transition duration-150"
                  title="打开共享内容"
                  onClick={() => void openSession(session)}
                >
                  <span
                    className="text-text-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]"
                    title={session.title}
                  >
                    {session.title || "未命名内容"}
                  </span>
                  <span className="text-text-3 inline-flex items-center gap-1.5 text-[11px]">
                    <StatusDot tone={status.tone} />
                    {status.label}
                  </span>
                </button>
                <ContentCollaborationControl documentId={session.id} compact />
              </li>
            );
          })}
        </ul>
      )}
      <CustomModal
        open={joinOpen}
        onCancel={() => setJoinOpen(false)}
        title="加入协作"
        subtitle="向内容作者索取 12 位协作码，提交后等待对方批准"
        okText="申请加入"
        confirmLoading={busy}
        okButtonProps={{ disabled: !code.trim() }}
        onOk={async () => {
          setBusy(true);
          try {
            await invoke("collaboration:join", code.trim());
            setCode("");
            setJoinOpen(false);
            message.success("加入申请已提交，等待作者批准");
          } catch (error) {
            message.error(error instanceof Error ? error.message : "申请失败");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          aria-label="协作码"
          className="border-border-1 bg-bg-input text-text-1 placeholder:text-text-3 w-full rounded-[10px] border px-3 py-2 font-mono text-sm tracking-[0.08em] outline-none transition duration-150 placeholder:font-sans placeholder:tracking-normal focus:border-[var(--th-border-focus)] focus:shadow-[var(--th-focus-ring)]"
          placeholder="例如 K7QX-M3AZ-9BCD"
          value={code}
          maxLength={32}
          autoFocus
          onChange={event => setCode(event.target.value)}
        />
      </CustomModal>
      {contentId !== undefined && (
        <RichTextEditModal
          contentId={contentId}
          title="共享内容"
          visible
          onClose={() => setContentId(undefined)}
        />
      )}
    </div>
  );
}
