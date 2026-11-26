/**
 * 共享本地内容：检索选择一段内容或一块白板 → 主进程冻结本地编辑、上传附件、创建共享文档 →
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
  PenTool,
  Search,
  type LucideIcon,
} from "lucide-react";
import { Button, Dialog, DialogBody, Input, Loading, Segmented } from "@tau/ui";
import type { CollaborationSession, SharedWhiteboardInfo, SourceType } from "@tau/collaboration";
import { createSharedContent } from "@/commands";
import { InvitationCode } from "@/components/CollaborationUI";
import { clampText, richTextPlainText } from "@tau/shared/rich-text-text";
import type { ContentIndexType, SearchResult } from "@/types";
import { remoteFailureText } from "../remoteErrors.i18n";
import { useSharingI18n, sharingFailureText } from "../sharing.i18n";
import { shareWhiteboardCandidate } from "@/services/whiteboard-documents/share";
import useSettingStore from "@/stores/useSettingStore";
import { whiteboardSession } from "@/features/whiteboards/collaboration";
import { useShareCandidates, useWhiteboardShareCandidates, type ShareType } from "../queries";

// 默认标题前缀会写入共享文档，界面类型名另行翻译。
const TYPE_META: Record<
  ContentIndexType,
  { defaultTitlePrefix: string; icon: LucideIcon; source: SourceType }
> = {
  article: { defaultTitlePrefix: "文章", icon: FileText, source: "article" },
  card: { defaultTitlePrefix: "卡片", icon: Layers, source: "card" },
  "project-item": { defaultTitlePrefix: "项目文档", icon: FolderKanban, source: "project-item" },
  // 日记没有独立的来源类型，按通用内容共享
  "diary-moment": { defaultTitlePrefix: "日记", icon: PenLine, source: "content" },
};

/** 候选只检索 SHAREABLE_TYPES（正文实体），不会出现外部材料 */
const metaOf = (item: SearchResult) => TYPE_META[item.type as ContentIndexType];

const titleOf = (item: SearchResult) =>
  item.title?.trim() ||
  clampText(richTextPlainText(item.content), 40) ||
  `${metaOf(item).defaultTitlePrefix} #${item.contentId}`;

type Phase =
  | { kind: "pick" }
  | { kind: "sharing"; title?: string }
  | { kind: "done"; documentId: string };

/** 正文与白板合成同一张候选表；share 返回协作文档 id。 */
interface Candidate {
  key: string;
  title?: string;
  label: string;
  icon: LucideIcon;
  share(): Promise<string>;
  failureKind: "content" | "remote";
}

export function ShareLocalDialog({
  open,
  onOpenChange,
  sessions,
  whiteboards,
  onShared,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: CollaborationSession[];
  whiteboards: SharedWhiteboardInfo[];
  /** 共享完成（协作码已展示）后跳到这份内容 */
  onShared: (documentId: string) => void;
}) {
  const { t, locale } = useSharingI18n();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ShareType>("all");
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [error, setError] = useState<{ cause: unknown; kind: Candidate["failureKind"] }>();
  const keyword = useDebounce(query, { wait: 250 });
  const candidates = useShareCandidates(keyword, type);
  const boards = useWhiteboardShareCandidates(keyword, type);
  const databaseName = useSettingStore(state => state.setting.database.active);
  // 仅活跃共享占用候选；已结束（含未清理的残留）不占用——主进程创建时会先写回并拆除残留再重建
  const sharedIds = new Set(
    sessions
      .filter(session => session.status === "active")
      .map(session => session.source?.contentId)
  );
  const list: Candidate[] = [
    ...(type === "whiteboard" ? [] : (candidates.data ?? []))
      .filter(item => !sharedIds.has(item.contentId))
      .map(item => {
        const meta = metaOf(item);
        const title = titleOf(item);
        return {
          key: `${item.type}-${item.id}`,
          title,
          label: t(`kind.${item.type as ContentIndexType}`),
          icon: meta.icon,
          share: async () =>
            (
              await createSharedContent(
                item.contentId,
                meta.source,
                meta.source === "content" ? item.contentId : item.id,
                // 卡片不参与标题同步
                item.type === "card" ? undefined : title
              )
            ).documentId,
          failureKind: "content" as const,
        };
      }),
    ...(type === "whiteboard" || type === "all" ? (boards.data ?? []) : []).map(board => ({
      key: `whiteboard-${board.boardId}`,
      title: board.title || undefined,
      label: t("share.pages", { count: board.pages, amount: board.pages.toLocaleString(locale) }),
      icon: PenTool,
      share: async () => (await shareWhiteboardCandidate(databaseName, board)).documentId,
      failureKind: "remote" as const,
    })),
  ];
  const sharedSession =
    phase.kind === "done" ? sessions.find(session => session.id === phase.documentId) : undefined;
  const sharedRoom =
    phase.kind === "done" ? whiteboards.find(room => room.id === phase.documentId) : undefined;
  const shared = sharedSession ?? (sharedRoom && whiteboardSession(sharedRoom));
  const searching = type === "whiteboard" || keyword.trim().length > 0;
  const loading = candidates.isLoading || boards.isLoading;

  const share = async (item: Candidate) => {
    setError(undefined);
    setPhase({ kind: "sharing", title: item.title });
    try {
      setPhase({ kind: "done", documentId: await item.share() });
    } catch (failure) {
      setError({ cause: failure, kind: item.failureKind });
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
          ? t("share.title")
          : phase.kind === "sharing"
            ? t("share.sharing", { title: phase.title ?? t("board.untitled") })
            : t("share.doneTitle", { title: shared?.title || t("share.content") })
      }
      subtitle={
        phase.kind === "pick"
          ? t("share.pickHint")
          : phase.kind === "sharing"
            ? t("share.sharingHint")
            : t("share.doneHint")
      }
      footer={
        phase.kind === "done" ? (
          <Button variant="primary" data-autofocus onClick={close}>
            {t("share.done")}
          </Button>
        ) : undefined
      }
    >
      <DialogBody>
        {phase.kind === "pick" && (
          <div className="flex flex-col gap-2.5">
            <Input
              data-autofocus
              lead={Search}
              clearable
              value={query}
              placeholder={t("share.search")}
              onChange={event => setQuery(event.target.value)}
            />
            <Segmented
              label={t("share.type")}
              value={type}
              onValueChange={setType}
              className="self-start"
            >
              <Segmented.Item value="all" label={t("share.all")} />
              {(Object.keys(TYPE_META) as ContentIndexType[]).map(key => (
                <Segmented.Item key={key} value={key} label={t(`kind.${key}`)} />
              ))}
              <Segmented.Item value="whiteboard" label={t("share.whiteboard")} />
            </Segmented>
            {error && (
              <p
                role="alert"
                className="bg-danger-soft text-danger text-tau-meta rounded-tau-sm px-3 py-2"
              >
                {error.kind === "remote"
                  ? remoteFailureText(error.cause)
                  : sharingFailureText(error.cause)}
              </p>
            )}
            <div className="-mx-2 h-[280px] overflow-y-auto px-2">
              {!searching ? (
                <p className="text-ink-3 text-tau-meta pt-16 text-center">{t("share.emptyHint")}</p>
              ) : loading ? (
                <Loading minHeight={0} />
              ) : list.length === 0 ? (
                <p className="text-ink-3 text-tau-meta pt-16 text-center">{t("share.noResults")}</p>
              ) : (
                <ul className="flex flex-col">
                  {list.map(item => {
                    const Icon = item.icon;
                    return (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={() => void share(item)}
                          className="rounded-tau-sm hover:bg-hover group flex min-h-11 w-full cursor-pointer items-center gap-2.5 px-2 text-left"
                        >
                          <span className="bg-hover text-ink-2 grid size-7 flex-none place-items-center rounded-[8px]">
                            <Icon className="size-[15px]" strokeWidth={1.75} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="text-tau-body block truncate">
                              {item.title ?? t("board.untitled")}
                            </span>
                            <span className="text-ink-3 text-tau-sm">{item.label}</span>
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
        {phase.kind === "sharing" && <Loading minHeight={120} className="h-auto" />}
        {phase.kind === "done" &&
          (shared ? (
            <InvitationCode session={shared} />
          ) : (
            <Loading minHeight={120} className="h-auto" />
          ))}
      </DialogBody>
    </Dialog>
  );
}
