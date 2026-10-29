/**
 * 卡片预览弹窗：
 * 纯粹的编辑 / 预览定位——正文可直接编辑（节流自动保存，关闭时兜底一次），
 * 标签增删改经既有 AddTag。无 footer；自定义头部把标题、meta 与「进入详情」/
 * More 菜单 / × 排在同一行（More 为域内共享 CardActionMenu；「进入详情」菜单项与演示前落盘为预览
 * 特有差异，经 props 注入）。元数据由卡片查询同步，标签仅提交字段补丁；
 * 正文经 ContentEditor 文档会话同步。「进入详情」落盘后交 actions.onOpenDetail，
 * 由宿主在同一次形变里收起预览并 push 详情（D-106）；ref 指向弹窗卡体，宿主据此
 * 定位形变的起止元素（卡体 data-state="open" 即内容就绪）。正文会话就绪前以只读全文
 * 占位显示，弹窗随卡片数据就位即可展示，形变不等会话加载。
 */

import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import { useRafInterval, useUnmount } from "ahooks";
import { produce } from "immer";
import type { Descendant, Editor as SlateEditor } from "slate";
import { Maximize2, MoreHorizontal, X } from "lucide-react";
import type { EditorRef } from "@tau/editor";
import AddTag from "@/components/AddTag";
import ContentEditor from "@/components/ContentEditor";
import { ErrorBoundary } from "@tau/ui";
import { formatDate, getContentLength } from "@/utils";
import { useCardsMutations } from "../queries";
import type { ICard } from "@/types";
import { CardActionMenu } from "./CardActionMenu";
import { CardContentPreview } from "./CardContentPreview";
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
  ref?: Ref<HTMLDivElement>;
}

export function CardPreviewDialog({
  open,
  card,
  error,
  onRetry,
  actions,
  onOpenChange,
  onSaved,
  ref,
}: CardPreviewDialogProps) {
  const [editing, setEditing] = useState<ICard | null>(null);
  const [initValue, setInitValue] = useState<Descendant[]>([]);
  const [displayError, setDisplayError] = useState(error);
  const editorRef = useRef<EditorRef>(null);
  const prevRef = useRef<ICard | null>(null);
  const { patch } = useCardsMutations();
  const saving = useRef<Promise<ICard | null> | null>(null);

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
    setEditing(
      produce(editing, draft => {
        draft.content = content;
        draft.count = getContentLength(content);
      })
    );
  };

  const handleContentChange = (content: Descendant[]) => {
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
      editing.linkCount > 0 ? `${editing.linkCount} 连接` : null,
      `${editing.count} 字`,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [editing]);

  const openDetail = async () => {
    await saveCard();
    if (editing) actions.onOpenDetail(editing);
  };

  const loadFailed = Boolean(displayError && !card);
  const title = editing ? `卡片 #${editing.id}` : "卡片预览";

  const close = () => {
    void saveCard()
      .then(() => onOpenChange(false))
      .catch(() => {});
  };

  /* 标题行与操作组同排：左 = 标题 + meta，右 = 进入详情 / More / ×，三枚图标同尺寸同基线 */
  const header = (
    <div className="flex items-start gap-3 pt-3 pr-3 pl-6">
      <div className="min-w-0 flex-1 pt-[10px]">
        <h2
          title={title}
          className="text-ink-1 truncate text-[16px] leading-[1.45] font-[650] tracking-[-0.01em]"
        >
          {title}
        </h2>
        {editing && !loadFailed && (
          <p className="text-ink-3 text-tau-meta mt-[3px] truncate">{meta}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {editing && !loadFailed && (
          <>
            <IconButton
              title="进入详情"
              className="size-[28px] rounded-[8px]"
              onClick={() => {
                void openDetail().catch(() => {});
              }}
            >
              <Maximize2 className="size-[14px]" />
            </IconButton>
            <CardActionMenu
              card={editing}
              actions={actions}
              trigger={
                <IconButton title="更多操作" className="size-[28px] rounded-[8px]">
                  <MoreHorizontal className="size-[14px]" />
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
            <span aria-hidden className="bg-line-2 mx-1 h-4 w-px" />
          </>
        )}
        <IconButton
          aria-label="关闭"
          title="关闭"
          disabled={patch.isPending}
          className="size-[28px] rounded-[8px]"
          onClick={close}
        >
          <X className="size-[14px]" />
        </IconButton>
      </div>
    </div>
  );

  return (
    <Dialog
      ref={ref}
      open={open && (Boolean(card && editing?.id === card.id) || Boolean(error))}
      onAfterClose={() => {
        if (open) return;
        setEditing(null);
        setInitValue([]);
        setDisplayError(undefined);
        prevRef.current = null;
      }}
      onOpenChange={open => {
        if (open) onOpenChange(true);
        else close();
      }}
      locked={patch.isPending}
      title={title}
      header={header}
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
      {/* 只有正文滚动：头部与标签栏放在 DialogBody 之外，钉在滚动区上下 */}
      {editing && !loadFailed && (
        <>
          <DialogBody className="mb-0 pt-3">
            <ErrorBoundary>
              <ContentEditor
                contentId={editing.contentId}
                ref={editorRef}
                key={editing.id}
                initValue={initValue}
                onInit={handleInit}
                fallback={
                  <CardContentPreview
                    content={initValue}
                    blocks={Infinity}
                    className="min-h-[240px]"
                  />
                }
                onChange={handleContentChange}
                readonly={false}
                source={{ sourceType: "card", sourceId: editing.id }}
                className="min-h-[240px]"
              />
            </ErrorBoundary>
          </DialogBody>
          <div className="shrink-0 px-6 pt-3 pb-[22px]">
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
