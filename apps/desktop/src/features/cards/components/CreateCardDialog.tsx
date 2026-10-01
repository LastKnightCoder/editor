/**
 * 新建卡片弹窗（新版 CreateCard，旧 motion 版仍在 legacy 服役）：
 * tau Editor + AddTag + 草稿 localStorage 暂存（沿用旧版 key，未保存草稿跨会话保留），
 * 保存后广播 card:created 并整域失效刷新。
 */

import { useEffect, useRef, useState } from "react";
import { useLocalStorageState } from "ahooks";
import type { Descendant } from "slate";
import type { EditorRef } from "@tau/editor";
import AddTag from "@/components/AddTag";
import ContentEditor from "@/components/ContentEditor";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useCardsMutations } from "../queries";
import { DEFAULT_CARD_CONTENT } from "@/constants";
import { getContentLength } from "@/utils";
import { ECardCategory, type ICard } from "@/types";
import { cardCategoryName } from "@/constants/card";
import { Button, Dialog, DialogBody, toast } from "@tau/ui";

export interface CreateCardDialogProps {
  open: boolean;
  /** 打开入口携带的默认分类（旧版：数据库视图新建 / 分类上下文） */
  defaultCategory: ECardCategory;
  onClose(): void;
  onCreated?(card: ICard): void;
}

export function CreateCardDialog({
  open,
  defaultCategory,
  onClose,
  onCreated,
}: CreateCardDialogProps) {
  const [content, setContent] = useLocalStorageState<Descendant[]>("card-edit-content", {
    defaultValue: DEFAULT_CARD_CONTENT,
  });
  const [tags, setTags] = useLocalStorageState<string[]>("card-edit-tags", { defaultValue: [] });
  const [category, setCategory] = useState<ECardCategory>(defaultCategory);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<EditorRef>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const { create } = useCardsMutations();

  useEffect(() => {
    if (open) setCategory(defaultCategory);
  }, [open, defaultCategory]);

  useEffect(() => {
    if (open) setTimeout(() => editorRef.current?.focus(), 120);
  }, [open]);

  const resetDraft = () => {
    setContent(DEFAULT_CARD_CONTENT);
    setTags([]);
    setEditorRevision(revision => revision + 1);
  };

  const handleSave = async () => {
    const value = content ?? DEFAULT_CARD_CONTENT;
    if (getContentLength(value) === 0) {
      toast.warning("卡片内容为空");
      return;
    }
    setSaving(true);
    try {
      const card = await create.mutateAsync({
        content: value,
        tags: tags ?? [],
        links: [],
        category,
        count: getContentLength(value),
        isTop: false,
      });
      onCreated?.(card);
      resetDraft();
      onClose();
      toast.success("卡片已创建");
    } catch {
      toast.error("创建失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) {
          resetDraft();
          onClose();
        }
      }}
      title="新建卡片"
      locked={saving}
      width={720}
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            disabled={saving}
            onClick={() => {
              resetDraft();
              onClose();
            }}
          >
            取消
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={() => void handleSave()}>
            保存
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5 text-[12px]">
            <span className="text-ink-3">分类</span>
            {(Object.keys(cardCategoryName) as ECardCategory[]).map(key => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className={
                  category === key
                    ? "bg-selected text-ink-1 rounded-full px-2.5 py-0.5 font-medium"
                    : "text-ink-2 hover:bg-hover hover:text-ink-1 rounded-full px-2.5 py-0.5"
                }
              >
                {cardCategoryName[key]}
              </button>
            ))}
          </div>
          <ErrorBoundary>
            <ContentEditor
              key={editorRevision}
              ref={editorRef}
              initValue={content ?? DEFAULT_CARD_CONTENT}
              readonly={false}
              onChange={setContent}
              className="min-h-[260px]"
            />
          </ErrorBoundary>
          <AddTag
            tags={tags ?? []}
            addTag={tag => setTags([...new Set([...(tags ?? []), tag])])}
            removeTag={tag => setTags((tags ?? []).filter(t => t !== tag))}
            editTag={(oldTag, newTag) => {
              if (!newTag || newTag === oldTag) return;
              setTags((tags ?? []).map(tag => (tag === oldTag ? newTag : tag)));
            }}
          />
        </div>
      </DialogBody>
    </Dialog>
  );
}
