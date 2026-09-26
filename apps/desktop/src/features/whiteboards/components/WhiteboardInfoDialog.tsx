/**
 * 新建 / 编辑白板信息：标题 + 描述 + 标签。封面不在表单里（卡片菜单「设置封面」）。
 * 标签：上行是已选标签（× 移除）+ 新标签输入框（回车添加）；下行是其余已有标签，点选加入。
 * 在某个标签下新建时预先带上它。
 */

import { useEffect, useState } from "react";
import { Hash, Plus, X } from "lucide-react";
import { Button, Dialog, DialogBody, Input, Textarea, toast } from "@tau/ui";
import { normalizeTags } from "../model";
import type { WhiteboardInfo } from "../queries";

export interface WhiteboardInfoDialogProps {
  open: boolean;
  /** 编辑态传入现有信息；新建态为 null */
  initial: WhiteboardInfo | null;
  /** 新建时预选的标签（当前所在的侧栏标签） */
  presetTags?: string[];
  /** 全部已有标签（按使用次数排好） */
  knownTags: string[];
  onClose(): void;
  onSubmit(info: WhiteboardInfo): Promise<void>;
}

export function WhiteboardInfoDialog({
  open,
  initial,
  presetTags = [],
  knownTags,
  onClose,
  onSubmit,
}: WhiteboardInfoDialogProps) {
  const editing = initial !== null;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // 开启时按目标重置，上次的残留不带入
  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setDescription(initial?.description ?? "");
    setTags(initial?.tags ?? presetTags);
    setDraft("");
    // presetTags 每次渲染可能是新数组，只在打开时取一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const candidates = knownTags.filter(name => !tags.includes(name));
  const add = (name: string) => setTags(prev => normalizeTags([...prev, name]));
  const remove = (name: string) => setTags(prev => prev.filter(t => t !== name));
  const addDraft = () => {
    if (!draft.trim()) return;
    add(draft);
    setDraft("");
  };

  const submit = () => {
    setSaving(true);
    onSubmit({ title, description, tags: normalizeTags([...tags, draft]) })
      .then(onClose)
      .catch(() => toast.error(editing ? "保存失败" : "创建失败"))
      .finally(() => setSaving(false));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onClose()}
      title={editing ? "编辑信息" : "新建白板"}
      locked={saving}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={submit}>
            {editing ? "保存" : "创建并打开"}
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-2 text-[12px]">标题</span>
            <Input
              data-autofocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
              }}
              placeholder="未命名白板"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-2 text-[12px]">
              描述 <span className="text-ink-3">· 可选</span>
            </span>
            <Textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="这块白板用来做什么"
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-ink-2 text-[12px]">
              标签 <span className="text-ink-3">· 可选，出现在侧栏「白板」下面</span>
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map(name => (
                <button
                  key={name}
                  type="button"
                  aria-label={`移除标签 ${name}`}
                  onClick={() => remove(name)}
                  className="text-tau-meta bg-selected text-accent-text group inline-flex h-[26px] items-center gap-1 rounded-full px-2.5 font-medium"
                >
                  <Hash className="size-[11px]" strokeWidth={1.75} />
                  {name}
                  <X
                    className="ease-tau-out size-[11px] opacity-70 transition-opacity duration-150 group-hover:opacity-100"
                    strokeWidth={1.75}
                  />
                </button>
              ))}
              <label className="border-line-1 focus-within:border-accent text-ink-3 inline-flex h-[26px] items-center gap-1 rounded-full border border-dashed pl-2 pr-2.5 focus-within:border-solid">
                <Plus className="size-[12px]" strokeWidth={1.75} />
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      e.stopPropagation();
                      addDraft();
                    }
                  }}
                  onBlur={addDraft}
                  placeholder="新标签"
                  className="text-tau-meta text-ink-1 placeholder:text-ink-3 w-[72px] bg-transparent outline-none"
                />
              </label>
            </div>
            {candidates.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-ink-3 mr-0.5 text-[11px]">已有标签</span>
                {candidates.map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => add(name)}
                    className="text-tau-meta ease-tau-out border-line-1 text-ink-2 hover:bg-hover hover:text-ink-1 inline-flex h-[26px] items-center gap-1 rounded-full border px-2.5 transition-[background,color] duration-150"
                  >
                    <Hash className="size-[11px]" strokeWidth={1.75} />
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
}
