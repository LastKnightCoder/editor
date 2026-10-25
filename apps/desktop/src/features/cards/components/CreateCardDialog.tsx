/**
 * 新建卡片弹窗（新版 CreateCard，旧 motion 版仍在 legacy 服役）：
 * tau Editor + AddTag + 草稿 localStorage 暂存（沿用旧版 key，未保存草稿跨会话保留），
 * 保存后广播 card:created 并整域失效刷新。传入 initial 时为预填模式（插件 card.create），
 * 内容只在本次弹窗中，不改动草稿。
 */

import { useEffect, useRef, useState } from "react";
import { useLocalStorageState } from "ahooks";
import type { Descendant } from "slate";
import type { EditorRef } from "@tau/editor";
import AddTag from "@/components/AddTag";
import ContentEditor from "@/components/ContentEditor";
import { ErrorBoundary } from "@tau/ui";
import { useCardsMutations } from "../queries";
import { DEFAULT_CARD_CONTENT } from "@/constants";
import { getContentLength, isContentEmpty } from "@/utils";
import type { ICard } from "@/types";
import { Button, Dialog, DialogBody, toast } from "@tau/ui";

export interface CardDraft {
  contracts?: import("@tau/db-schema/content-contracts").ContentContractDictionary;
  content: Descendant[];
  tags: string[];
}

export interface CreateCardDialogProps {
  open: boolean;
  onClose(): void;
  onCreated?(card: ICard): void;
  /** 预填内容；不传时使用跨会话保留的草稿 */
  initial?: CardDraft;
}

const EMPTY_DRAFT: CardDraft = { content: DEFAULT_CARD_CONTENT, tags: [] };

/** 草稿存在 localStorage；预填时改用组件内状态，不改动草稿 */
function useCardDraft(initial: CardDraft | undefined) {
  const [storedContent, setStoredContent] = useLocalStorageState<Descendant[]>(
    "card-edit-content",
    { defaultValue: DEFAULT_CARD_CONTENT }
  );
  const [storedTags, setStoredTags] = useLocalStorageState<string[]>("card-edit-tags", {
    defaultValue: [],
  });
  const [local, setLocal] = useState<CardDraft>(initial ?? EMPTY_DRAFT);
  if (initial)
    return {
      ...local,
      setContent: (content: Descendant[]) => setLocal(draft => ({ ...draft, content })),
      setTags: (tags: string[]) => setLocal(draft => ({ ...draft, tags })),
      reset: () => setLocal(EMPTY_DRAFT),
    };
  return {
    content: storedContent ?? DEFAULT_CARD_CONTENT,
    tags: storedTags ?? [],
    setContent: setStoredContent,
    setTags: setStoredTags,
    reset: () => {
      setStoredContent(DEFAULT_CARD_CONTENT);
      setStoredTags([]);
    },
  };
}

export function CreateCardDialog({ open, onClose, onCreated, initial }: CreateCardDialogProps) {
  const { content, tags, setContent, setTags, reset } = useCardDraft(initial);
  const contracts = initial?.contracts;
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<EditorRef>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const { create } = useCardsMutations();

  useEffect(() => {
    if (open) setTimeout(() => editorRef.current?.focus(), 120);
  }, [open]);

  const resetDraft = () => {
    reset();
    setEditorRevision(revision => revision + 1);
  };

  const handleSave = async () => {
    const value = content;
    if (isContentEmpty(value)) {
      toast.warning("卡片内容为空");
      return;
    }
    setSaving(true);
    try {
      const card = await create.mutateAsync({
        content: value,
        contracts,
        tags,
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
          <ErrorBoundary>
            <ContentEditor
              key={editorRevision}
              ref={editorRef}
              initValue={content}
              contracts={contracts}
              readonly={false}
              onChange={setContent}
              className="min-h-[260px]"
            />
          </ErrorBoundary>
          <AddTag
            tags={tags}
            addTag={tag => setTags([...new Set([...tags, tag])])}
            removeTag={tag => setTags(tags.filter(t => t !== tag))}
            editTag={(oldTag, newTag) => {
              if (!newTag || newTag === oldTag) return;
              setTags(tags.map(tag => (tag === oldTag ? newTag : tag)));
            }}
          />
        </div>
      </DialogBody>
    </Dialog>
  );
}
