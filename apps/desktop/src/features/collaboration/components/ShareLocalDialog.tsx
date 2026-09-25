/**
 * 共享本地内容：检索选择一段内容 → 主进程冻结本地编辑、上传附件、创建共享文档 →
 * 原位展示协作码。已共享的内容不出现在候选里；共享后内容仍在原处照常编辑。
 */

import { useState } from "react";
import { useDebounce } from "ahooks";
import {
  ArrowRight,
  FileText,
  FolderKanban,
  Layers,
  PenLine,
  Search,
  type LucideIcon,
} from "lucide-react";
import { Button, Dialog, Input, Loading, Segmented } from "@tau/ui";
import type { CollaborationSession, SourceType } from "@tau/collaboration";
import { createSharedContent } from "@/commands";
import { InvitationCode } from "@/components/CollaborationUI";
import { clampText, richTextPlainText } from "@/utils/richTextText";
import type { IndexType, SearchResult } from "@/types";
import { useShareCandidates } from "../queries";

const TYPE_META: Record<IndexType, { label: string; icon: LucideIcon; source: SourceType }> = {
  article: { label: "文章", icon: FileText, source: "article" },
  card: { label: "卡片", icon: Layers, source: "card" },
  "project-item": { label: "项目文档", icon: FolderKanban, source: "project-item" },
  // 日记没有独立的来源类型，按通用内容共享
  "diary-daily": { label: "日记", icon: PenLine, source: "content" },
};

const titleOf = (item: SearchResult) =>
  item.title?.trim() ||
  clampText(richTextPlainText(item.content), 40) ||
  `${TYPE_META[item.type].label} #${item.contentId}`;

type Phase =
  { kind: "pick" } | { kind: "sharing"; title: string } | { kind: "done"; documentId: string };

export function ShareLocalDialog({
  open,
  onOpenChange,
  sessions,
  onShared,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: CollaborationSession[];
  /** 共享完成（协作码已展示）后跳到这份内容 */
  onShared: (documentId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<IndexType | "all">("all");
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [error, setError] = useState<string>();
  const keyword = useDebounce(query, { wait: 250 });
  const candidates = useShareCandidates(keyword, type);
  // 仅活跃共享占用候选；已结束（含未清理的残留）不占用——主进程创建时会先写回并拆除残留再重建
  const sharedIds = new Set(
    sessions
      .filter(session => session.status === "active")
      .map(session => session.source?.contentId)
  );
  const list = (candidates.data ?? []).filter(item => !sharedIds.has(item.contentId));
  const shared =
    phase.kind === "done" ? sessions.find(session => session.id === phase.documentId) : undefined;

  const share = async (item: SearchResult) => {
    const meta = TYPE_META[item.type];
    const title = titleOf(item);
    setError(undefined);
    setPhase({ kind: "sharing", title });
    try {
      const result = await createSharedContent(
        item.contentId,
        meta.source,
        meta.source === "content" ? item.contentId : item.id,
        // 卡片不参与标题同步
        item.type === "card" ? undefined : title
      );
      setPhase({ kind: "done", documentId: result.documentId });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "共享失败");
      setPhase({ kind: "pick" });
    }
  };

  const close = () => {
    onOpenChange(false);
    if (phase.kind === "done") onShared(phase.documentId);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => (next ? onOpenChange(true) : close())}
      onAfterClose={() => {
        setQuery("");
        setType("all");
        setPhase({ kind: "pick" });
        setError(undefined);
      }}
      locked={phase.kind === "sharing"}
      size="lg"
      title={
        phase.kind === "pick"
          ? "共享本地内容"
          : phase.kind === "sharing"
            ? `正在共享「${phase.title}」`
            : `已共享「${shared?.title || "内容"}」`
      }
      subtitle={
        phase.kind === "pick"
          ? "选一段内容发起协作。共享后它仍在原处，编辑会实时同步给成员。"
          : phase.kind === "sharing"
            ? "正在暂停本地编辑、上传附件并创建共享文档，请不要关闭应用。"
            : "把协作码发给对方。对方申请后，你会在通知和侧栏里看到。"
      }
      footer={
        phase.kind === "done" ? (
          <Button variant="primary" data-autofocus onClick={close}>
            完成
          </Button>
        ) : undefined
      }
    >
      {phase.kind === "pick" && (
        <div className="flex flex-col gap-2.5">
          <Input
            data-autofocus
            lead={Search}
            clearable
            value={query}
            placeholder="搜索标题或正文"
            onChange={event => setQuery(event.target.value)}
          />
          <Segmented label="内容类型" value={type} onValueChange={setType} className="self-start">
            <Segmented.Item value="all" label="全部" />
            {(Object.keys(TYPE_META) as IndexType[]).map(key => (
              <Segmented.Item key={key} value={key} label={TYPE_META[key].label} />
            ))}
          </Segmented>
          {error && (
            <p
              role="alert"
              className="bg-danger-soft text-danger text-tau-meta rounded-tau-sm px-3 py-2"
            >
              {error}
            </p>
          )}
          <div className="-mx-2 h-[280px] overflow-y-auto px-2">
            {!keyword.trim() ? (
              <p className="text-ink-3 text-tau-meta pt-16 text-center">
                输入关键词，搜索文章、卡片、项目文档或日记
              </p>
            ) : candidates.isPending ? (
              <Loading />
            ) : list.length === 0 ? (
              <p className="text-ink-3 text-tau-meta pt-16 text-center">没有找到可共享的内容</p>
            ) : (
              <ul className="flex flex-col">
                {list.map(item => {
                  const Icon = TYPE_META[item.type].icon;
                  return (
                    <li key={`${item.type}-${item.id}`}>
                      <button
                        type="button"
                        onClick={() => void share(item)}
                        className="rounded-tau-sm hover:bg-hover group flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-2 text-left"
                      >
                        <span className="bg-hover text-ink-2 grid size-7 flex-none place-items-center rounded-[8px]">
                          <Icon className="size-[15px]" strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="text-tau-body block truncate">{titleOf(item)}</span>
                          <span className="text-ink-3 text-tau-sm">
                            {TYPE_META[item.type].label}
                          </span>
                        </span>
                        <ArrowRight
                          className="text-ink-3 size-4 flex-none opacity-0 group-hover:opacity-100"
                          strokeWidth={1.75}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
      {phase.kind === "sharing" && (
        <div className="grid h-[120px] place-items-center">
          <Loading />
        </div>
      )}
      {phase.kind === "done" && (shared ? <InvitationCode session={shared} /> : <Loading />)}
    </Dialog>
  );
}
