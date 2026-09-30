/**
 * 卡片预览弹窗：
 * 纯粹的编辑 / 预览定位——正文可直接编辑（节流自动保存，关闭时兜底一次），
 * 标签增删改经既有 AddTag。无 footer；右上区（× 下方）平铺「进入详情」+
 * More 菜单（域内共享 CardActionMenu；「进入详情」菜单项与演示前落盘为预览
 * 特有差异，经 props 注入）。元数据由卡片查询同步，标签仅提交字段补丁；
 * 正文经 useEditContent 同步。「进入详情」落盘后交 actions.onOpenDetail
 * （宿主演示为 navigator.push("card-detail")）。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRafInterval, useUnmount } from "ahooks";
import { produce } from "immer";
import type { Descendant, Editor as SlateEditor } from "slate";
import { Maximize2, MoreHorizontal } from "lucide-react";
import type { EditorRef } from "@tau/editor/src";
import AddTag from "@/components/AddTag";
import ContentEditor from "@/components/ContentEditor";
import ErrorBoundary from "@/components/ErrorBoundary";
import useEditContent from "@/hooks/useEditContent";
import { formatDate, getContentLength } from "@/utils";
import { useCardsMutations } from "../queries";
import type { ICard } from "@/types";
import { cardCategoryName } from "@/constants/card";
import { CardActionMenu } from "./CardActionMenu";
import type { CardItemActions } from "../types";
import { Dialog, DialogBody, IconButton, Button } from "@tau/ui";

const SAVE_INTERVAL = 500;

export interface CardPreviewDialogProps {
  open: boolean;
  card: ICard | null;
  error?: string;
  onRetry?(): void;
  actions: CardItemActions;
  onOpenChange(open: boolean): void;
  onSaved?(card: ICard): void;
}

export function CardPreviewDialog({
  open,
  card,
  error,
  onRetry,
  actions,
  onOpenChange,
  onSaved,
}: CardPreviewDialogProps) {
  const [editing, setEditing] = useState<ICard | null>(null);
  const [initValue, setInitValue] = useState<Descendant[]>([]);
  const [displayError, setDisplayError] = useState(error);
  const [readyEditorId, setReadyEditorId] = useState<number | null>(null);
  const editorRef = useRef<EditorRef>(null);
  const prevRef = useRef<ICard | null>(null);
  const { patch } = useCardsMutations();
  const saving = useRef<Promise<ICard | null> | null>(null);
  /* 正文会话与卡片元数据分别同步，避免标签保存覆盖正文或其他元数据。 */
  const { throttleHandleEditorContentChange } = useEditContent(editing?.contentId, content => {
    editorRef.current?.setEditorValue(content);
  });

  /* 打开 / 切卡：以传入卡片为基准，记录保存比对基线 */
  useEffect(() => {
    if (!card) return;
    const baseline = prevRef.current;
    setEditing(current => {
      if (!card || current?.id !== card.id) return card;
      const tagsDirty = JSON.stringify(current.tags) !== JSON.stringify(baseline?.tags);
      return { ...card, tags: tagsDirty ? current.tags : card.tags };
    });
    if (card?.id !== baseline?.id) setInitValue(card?.content ?? []);
    prevRef.current = card;
  }, [card]);

  useEffect(() => {
    if (open) setDisplayError(error);
  }, [open, error]);

  const saveCard = async (): Promise<ICard | null> => {
    if (saving.current) return saving.current;
    if (!editing) return null;
    if (JSON.stringify(editing.tags) === JSON.stringify(prevRef.current?.tags)) {
      return null;
    }
    const pending = patch
      .mutateAsync({ id: editing.id, patch: { tags: editing.tags } })
      .then(updated => {
        prevRef.current = updated;
        setEditing(current =>
          current?.id === updated.id
            ? {
                ...updated,
                tags:
                  JSON.stringify(current.tags) === JSON.stringify(editing.tags)
                    ? updated.tags
                    : current.tags,
              }
            : current
        );
        onSaved?.(updated);
        return updated;
      })
      .finally(() => {
        saving.current = null;
      });
    saving.current = pending;
    return pending;
  };

  useRafInterval(() => {
    void saveCard().catch(() => {});
  }, SAVE_INTERVAL);
  useUnmount(() => {
    void saveCard().catch(() => {});
  });

  const handleInit = (_editor: SlateEditor, content: Descendant[]) => {
    if (!editing) return;
    setReadyEditorId(editing.id);
    setEditing(
      produce(editing, draft => {
        draft.content = content;
        draft.count = getContentLength(content);
      })
    );
  };

  const handleContentChange = (content: Descendant[]) => {
    throttleHandleEditorContentChange(content);
    setEditing(prev =>
      prev
        ? produce(prev, draft => {
            draft.content = content;
            draft.count = getContentLength(content);
          })
        : prev
    );
  };

  const meta = useMemo(() => {
    if (!editing) return "";
    return [
      `创建于 ${formatDate(editing.create_time, true)}`,
      `最后修改 ${formatDate(editing.update_time, true)}`,
      editing.links.length > 0 ? `${editing.links.length} 连接` : null,
      `${editing.count} 字`,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [editing]);

  const openDetail = async () => {
    await saveCard();
    onOpenChange(false);
    if (editing) actions.onOpenDetail(editing);
  };

  const loadFailed = Boolean(displayError && !card);

  return (
    <Dialog
      open={open && (Boolean(card && editing?.id === card.id) || Boolean(error))}
      contentReady={Boolean(error) || Boolean(editing && readyEditorId === editing.id)}
      onAfterClose={() => {
        if (open) return;
        setEditing(null);
        setInitValue([]);
        setDisplayError(undefined);
        setReadyEditorId(null);
        prevRef.current = null;
      }}
      onOpenChange={open => {
        if (open) onOpenChange(true);
        else
          void saveCard()
            .then(() => onOpenChange(false))
            .catch(() => {});
      }}
      locked={patch.isPending}
      title={editing ? `卡片 #${editing.id}` : "卡片预览"}
      context={editing ? cardCategoryName[editing.category] : undefined}
      width={680}
    >
      {!card && displayError && (
        <DialogBody>
          <div className="flex min-h-[240px] flex-col items-center justify-center gap-3">
            <p role="alert" className="text-danger">
              读取卡片失败：{displayError}
            </p>
            <Button onClick={onRetry}>重试</Button>
          </div>
        </DialogBody>
      )}
      {/* 只有正文滚动：meta 行与标签栏放在 DialogBody 之外，钉在滚动区上下 */}
      {editing && !loadFailed && (
        <>
          {/* meta 与操作组同行：左 = 创建/修改/字数，右 = 进入详情 + More 菜单（与卡面 ⋯ 同源） */}
          <div className="text-ink-3 flex shrink-0 items-center gap-3.5 px-6 pt-[8px]">
            <span className="min-w-0 flex-1 truncate">{meta}</span>
            <span className="flex items-center gap-0.5">
              <IconButton
                title="进入详情"
                className="size-[24px] rounded-[7px]"
                onClick={() => {
                  void openDetail().catch(() => {});
                }}
              >
                <Maximize2 className="size-[14px]" strokeWidth={1.75} />
              </IconButton>
              <CardActionMenu
                card={editing}
                actions={actions}
                trigger={
                  <IconButton title="更多操作" className="size-[24px] rounded-[7px]">
                    <MoreHorizontal className="size-[14px]" strokeWidth={1.75} />
                  </IconButton>
                }
                detailItem={{
                  onSelect: () => {
                    void openDetail().catch(() => {});
                  },
                }}
                onBeforePresent={async () => {
                  /* 先落盘编辑中的内容再进入演示，并关掉预览弹窗（演示退出回列表，不恢复弹窗） */
                  await saveCard();
                  onOpenChange(false);
                }}
              />
            </span>
          </div>
          <DialogBody className="mb-0 pt-3">
            <ErrorBoundary>
              <ContentEditor
                contentId={editing.contentId}
                ref={editorRef}
                key={editing.id}
                initValue={initValue}
                onInit={handleInit}
                onLoadError={() => setReadyEditorId(editing.id)}
                onChange={handleContentChange}
                readonly={false}
                source={{ sourceType: "card", sourceId: editing.id }}
                className="min-h-[240px]"
              />
            </ErrorBoundary>
          </DialogBody>
          <div className="shrink-0 px-6 pb-[22px] pt-3">
            <AddTag
              tags={editing.tags}
              addTag={tag => {
                if (editing.tags.includes(tag)) return;
                setEditing(produce(editing, draft => void draft.tags.push(tag)));
              }}
              removeTag={tag =>
                setEditing(
                  produce(editing, draft => void (draft.tags = draft.tags.filter(t => t !== tag)))
                )
              }
              editTag={(oldTag, newTag) => {
                if (!newTag || newTag === oldTag || editing.tags.includes(newTag)) return;
                setEditing(
                  produce(
                    editing,
                    draft => void (draft.tags = draft.tags.map(t => (t === oldTag ? newTag : t)))
                  )
                );
              }}
            />
          </div>
        </>
      )}
    </Dialog>
  );
}
