/**
 * 答案元信息行（AnswerDialog 编辑模式钉在正文之上，不随正文滚动）：
 * 左 = 创建 / 最后修改 / 字数，右 = 「创建为」菜单——把答案 content 投射为卡片 /
 * 文章 / 项目文档（共享同一份 content）。已是卡片 / 文章的项不再出现；文章与项目
 * 文档先经标题弹窗确认；新实体引用同一份会话正文。
 */

import { useEffect, useMemo, useState } from "react";
import type { Descendant } from "slate";
import { useCreation } from "ahooks";
import { FilePlus2, FileText, FolderOpen, Layers } from "lucide-react";
import { Button, Dialog, DialogBody, Input, Menu, toast } from "@tau/ui";
import { getContentById } from "@/commands";
import { buildCardFromContent } from "@/commands/card";
import { buildArticleFromContent } from "@/commands/article";
import { defaultCardEventBus, defaultContentEventBus, formatDate, getContentLength } from "@/utils";
import { defaultArticleEventBus } from "@/utils/event-bus/article-event-bus";
import { getAnswerContentStatus } from "@/utils/answer-content";
import { getEditorText } from "@/utils/editor";
import useExtNoteInsertStore from "@/stores/useExtNoteInsertStore";

const ICON_CLASS = "size-[15px]";

type TitleTarget = "article" | "project";
const TARGET_LABEL: Record<TitleTarget, string> = { article: "文章", project: "项目文档" };

export function AnswerMetaBar({
  contentId,
  content,
}: {
  contentId: number;
  /** 编辑器当前内容：实时字数与默认标题 */
  content: Descendant[];
}) {
  const [times, setTimes] = useState<{ create: number; update: number } | null>(null);
  const [status, setStatus] = useState({ isCard: false, isArticle: false });
  /* 开关与目标分开存：关闭退场期间标题不闪空 */
  const [titleOpen, setTitleOpen] = useState(false);
  const [titleTarget, setTitleTarget] = useState<TitleTarget>("article");
  const [draftTitle, setDraftTitle] = useState("");
  const contentEditor = useCreation(() => defaultContentEventBus.createEditor(), []);

  const reloadStatus = () =>
    getAnswerContentStatus(contentId)
      .then(next => setStatus({ isCard: next.isCard, isArticle: next.isArticle }))
      .catch(() => {});

  useEffect(() => {
    let active = true;
    setTimes(null);
    getContentById(contentId)
      .then(next => {
        if (active && next) setTimes({ create: next.createTime, update: next.updateTime });
      })
      .catch(() => {});
    void reloadStatus();
    /* 自动保存经 content 事件广播新的 updateTime */
    const unsubscribe = contentEditor.subscribeToContentWithId(
      "content:updated",
      contentId,
      ({ content: next }) => setTimes({ create: next.createTime, update: next.updateTime })
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [contentId]);

  const meta = useMemo(
    () =>
      [
        times && `创建于 ${formatDate(times.create, true)}`,
        times && `最后修改 ${formatDate(times.update, true)}`,
        `${getContentLength(content)} 字`,
      ]
        .filter(Boolean)
        .join(" · "),
    [times, content]
  );

  const buildCard = async () => {
    const card = await buildCardFromContent(contentId).catch(() => null);
    if (!card) return void toast.error("创建卡片失败");
    defaultCardEventBus.createEditor().publishCardEvent("card:created", card);
    toast.success("已创建卡片");
    void reloadStatus();
  };

  const openTitleDialog = (target: TitleTarget) => {
    setDraftTitle(getEditorText(content, 20) || `答案 #${contentId}`);
    setTitleTarget(target);
    setTitleOpen(true);
  };

  const confirmTitle = async () => {
    const target = titleTarget;
    const title = draftTitle.trim();
    if (!title) return void toast.warning(`请输入${TARGET_LABEL[target]}标题`);
    setTitleOpen(false);
    if (target === "project") {
      useExtNoteInsertStore.getState().openModal({
        mode: "project",
        sourceContentId: contentId,
        title,
        insertMode: "shared-content",
        onSuccess: () => void reloadStatus(),
      });
      return;
    }
    const article = await buildArticleFromContent(contentId, title).catch(() => null);
    if (!article) return void toast.error("创建文章失败");
    defaultArticleEventBus.createEditor().publishArticleEvent("article:created", article);
    toast.success("已创建文章");
    void reloadStatus();
  };

  return (
    <div className="text-ink-3 flex shrink-0 items-center gap-3.5 px-6 pt-[8px]">
      <span className="min-w-0 flex-1 truncate tabular-nums">{meta}</span>
      <Menu
        align="end"
        trigger={
          <Button
            variant="ghost"
            size="sm"
            icon={FilePlus2}
            className="-my-1 -mr-1.5 h-[26px] px-2"
          >
            创建为
          </Button>
        }
      >
        {!status.isCard && (
          <Menu.Item
            icon={<Layers className={ICON_CLASS} strokeWidth={1.75} />}
            onSelect={() => void buildCard()}
          >
            卡片
          </Menu.Item>
        )}
        {!status.isArticle && (
          <Menu.Item
            icon={<FileText className={ICON_CLASS} strokeWidth={1.75} />}
            onSelect={() => openTitleDialog("article")}
          >
            文章…
          </Menu.Item>
        )}
        <Menu.Item
          icon={<FolderOpen className={ICON_CLASS} strokeWidth={1.75} />}
          onSelect={() => openTitleDialog("project")}
        >
          项目文档…
        </Menu.Item>
      </Menu>

      <Dialog
        open={titleOpen}
        onOpenChange={setTitleOpen}
        title={`创建${TARGET_LABEL[titleTarget]}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setTitleOpen(false)}>
              取消
            </Button>
            <Button variant="primary" size="sm" onClick={() => void confirmTitle()}>
              创建
            </Button>
          </>
        }
      >
        <DialogBody>
          <Input
            data-autofocus
            placeholder="标题"
            value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void confirmTitle();
              }
            }}
          />
        </DialogBody>
      </Dialog>
    </div>
  );
}
