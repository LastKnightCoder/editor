// 详情页标签内联编辑：浮起胶囊 + 行尾「＋ 标签」→ 原位输入 → 回车 / 完成落库。
// 编辑态下 chip 自带 × 可直接删除；新增与删除统一经 onCommit 串行写回。
// 写回经 onCommit 注入（卡片走 updateCardTags，文章 / 文档走各自 update 命令）。

import { useEffect, useRef, useState } from "react";
import { Check, Plus } from "lucide-react";
import TagChips from "./TagChips";

type TagInlineEditorProps = {
  tags: string[];
  onCommit: (tags: string[]) => Promise<void>;
  onError?: (error: unknown, fallback: string) => void;
};

export function TagInlineEditor({ tags, onCommit, onError }: TagInlineEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  // 写回后父层未必立刻回传新列表（文章 / 知识库走 invalidate 重拉），本地先乐观生效；
  // props 列表变化时再对齐，失败时回滚到它。
  const [localTags, setLocalTags] = useState(tags);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const propsTagsRef = useRef(tags);
  propsTagsRef.current = tags;
  // 串行化写回：连续增删时后一次必须基于前一次结果落库，否则会用旧列表覆盖新结果
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    setLocalTags(tags);
  }, [tags]);

  const stopEditing = () => {
    setEditing(false);
    setDraft("");
  };

  const enqueue = (next: string[], fallback: string) => {
    setLocalTags(next);
    const task = queueRef.current
      .catch(() => undefined)
      .then(() => onCommit(next))
      .catch(error => {
        setLocalTags(propsTagsRef.current);
        onError?.(error, fallback);
      });
    queueRef.current = task;
    return task;
  };

  const commit = async () => {
    const value = draft.trim().replace(/^#/, "");
    if (!value || saving || localTags.includes(value)) {
      stopEditing();
      return;
    }
    setSaving(true);
    try {
      await enqueue(localTags.concat(value), "标签保存失败");
    } finally {
      setSaving(false);
      stopEditing();
    }
  };

  const remove = (tag: string) => {
    void enqueue(
      localTags.filter(item => item !== tag),
      "标签删除失败"
    );
  };

  const openEditor = () => {
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <TagChips
      tags={localTags}
      variant="elevated"
      className="mt-5"
      onRemove={editing ? remove : undefined}
      trailing={
        editing ? (
          <>
            <span className="border-accent bg-page text-ink-1 inline-flex items-center gap-[1px] rounded-full border-[1.5px] border-solid px-3 py-[4px] text-[12px]">
              <span className="text-accent mr-[2px] text-[11px] font-bold" aria-hidden>
                #
              </span>
              <input
                ref={inputRef}
                value={draft}
                disabled={saving}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void commit();
                  }
                }}
                onBlur={() => void commit()}
                placeholder="输入标签名"
                enterKeyHint="done"
                className="text-ink-1 caret-accent placeholder:text-ink-3 w-24 bg-transparent text-[12px] outline-none"
              />
            </span>
            <button
              type="button"
              onClick={() => void commit()}
              className="border-accent text-accent inline-flex items-center gap-[3px] rounded-full border-[1.5px] border-solid px-2.5 py-[4px] text-[12px] font-semibold"
            >
              <Check size={12.5} strokeWidth={2.5} />
              完成
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={openEditor}
            className="border-line-1 text-ink-3 active:bg-hover inline-flex items-center gap-[3px] rounded-full border-[1.5px] border-dashed px-2.5 py-[4px] text-[12px] font-semibold"
          >
            <Plus size={12.5} strokeWidth={2.5} />
            标签
          </button>
        )
      }
    />
  );
}

export default TagInlineEditor;
