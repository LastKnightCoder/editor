/**
 * 新建 / 编辑弹窗（原 features/projects/components/CreateProjectDialog.tsx）。
 *
 * 拆模块后不再有「类型三选」——类型由用户从侧边栏进入哪个模块决定，
 * 弹窗只剩名称 + 富文本描述两个字段，新建与编辑共用；标题与 placeholder 取自
 * 模块的 CockpitCopy 字面量。
 */

import { useEffect, useRef, useState } from "react";
import type { Descendant } from "slate";
import type { EditorRef } from "@tau/editor";
import ContentEditor from "@/components/ContentEditor";
import { ErrorBoundary } from "@tau/ui";
import { Button, Dialog, DialogBody, Input, toast } from "@tau/ui";
import { getDescriptionKit } from "@/services/editorKit";
import type { CockpitCopy, CockpitItem, CockpitMutations } from "./types";

const EMPTY_DESC: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] },
];

export interface EntityDialogProps {
  open: boolean;
  /** 编辑态传入既有条目；新建态为 null */
  item: CockpitItem | null;
  copy: CockpitCopy;
  mutations: CockpitMutations;
  onClose(): void;
  /** 新建成功（编辑走 onSaved） */
  onCreated?(created: { id: number }): void;
  /** 编辑保存成功 */
  onSaved?(): void;
}

export function EntityDialog({
  open,
  item,
  copy,
  mutations,
  onClose,
  onCreated,
  onSaved,
}: EntityDialogProps) {
  const editing = item !== null;
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState<Descendant[]>(EMPTY_DESC);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<EditorRef>(null);
  const [editorRevision, setEditorRevision] = useState(0);

  /* 开启时为目标条目建立新编辑会话，关闭残留不带入下次。 */
  useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    const nextDesc = item?.desc?.length ? item.desc : EMPTY_DESC;
    setDesc(nextDesc);
    setEditorRevision(revision => revision + 1);
  }, [open, item]);

  const handleSave = () => {
    if (!title.trim()) {
      toast.warning("请输入名称");
      return;
    }
    setSaving(true);
    const action = editing
      ? mutations.updateInfo(item.id, title.trim(), desc).then(() => {
          onSaved?.();
          toast.success("已保存");
        })
      : mutations.create({ title: title.trim(), desc }).then(created => {
          onCreated?.(created);
          toast.success("已创建");
        });
    action
      .then(() => onClose())
      .catch(() => {
        toast.error(editing ? "保存失败" : "创建失败");
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
      title={editing ? copy.editTitle : copy.createTitle}
      locked={saving}
      width={560}
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
            {editing ? "保存" : "创建"}
          </Button>
        </>
      }
    >
      <DialogBody>
        <div className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-ink-2 text-[12px]">名称</span>
            <Input
              data-autofocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="名称"
              clearable
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-ink-2 text-[12px]">描述（可选）</span>
            {/* 与 Textarea 同形的输入框外观（描边 / 圆角 / 聚焦环）。块拖拽把手绝对定位在正文左侧，
              编辑器 overflow-hidden 把它裁掉（同聊天输入框），描述框里不需要拖拽排序；
              最小高度放外层——写在编辑器类名上会与空态 Slate 的内联 min-height 打架（同聊天输入框注释） */}
            <div className="border-line-1 bg-surface rounded-tau-sm ease-tau-out hover:not-focus-within:border-ink-3/50 focus-within:border-accent min-h-[136px] border px-3 py-2 transition-[border-color,box-shadow] duration-[160ms] focus-within:shadow-[var(--tau-focus-ring)]">
              <ErrorBoundary>
                <ContentEditor
                  key={editorRevision}
                  ref={editorRef}
                  kit={getDescriptionKit()}
                  initValue={desc}
                  readonly={false}
                  onChange={setDesc}
                  placeHolder={copy.descPlaceholder}
                  className="text-tau-body overflow-hidden"
                />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </DialogBody>
    </Dialog>
  );
}
