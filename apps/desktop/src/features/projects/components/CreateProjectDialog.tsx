/**
 * 新建 / 编辑项目弹窗（tau Dialog 皮，字段对齐 legacy EditProjectInfoModal：
 * 类型三选 + 标题 + 富文本描述）。
 * - 新建：项目页唯一的新建入口，类型在这里选——排在最前，三张可选卡片（图标 + 名称 + 一句说明）；
 *   创建成功后由宿主跳转项目详情；
 * - 编辑：类型不可改（三型的工作台形态不同，创建后改型会破坏子项语义），
 *   只改标题与描述。
 */

import { useEffect, useRef, useState } from "react";
import type { Descendant } from "slate";
import type { EditorRef } from "@tau/editor/src";
import ContentEditor from "@/components/ContentEditor";
import ErrorBoundary from "@/components/ErrorBoundary";
import type { Project } from "@/types/project";
import { Button, Dialog, Input, cn, toast } from "@tau/ui";
import { PROJECT_TYPE_META } from "../projectTypeMeta";
import { useProjectMutations, type CreateProjectInput } from "../queries";
import { PROJECT_TYPE_KEYS } from "../types";

const EMPTY_DESC: Descendant[] = [
  { type: "paragraph", children: [{ type: "formatted", text: "" }] },
];

export interface CreateProjectDialogProps {
  open: boolean;
  /** 编辑态传入既有项目；新建态为 null */
  project: Project | null;
  /** 新建入口携带的类型预选（编辑态忽略） */
  defaultType: CreateProjectInput["projectType"];
  onClose(): void;
  /** 新建成功（编辑走 onSaved） */
  onCreated?(project: Project): void;
  /** 编辑保存成功 */
  onSaved?(): void;
}

export function CreateProjectDialog({
  open,
  project,
  defaultType,
  onClose,
  onCreated,
  onSaved,
}: CreateProjectDialogProps) {
  const editing = project !== null;
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState<Descendant[]>(EMPTY_DESC);
  const [projectType, setProjectType] = useState<CreateProjectInput["projectType"]>(defaultType);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<EditorRef>(null);
  const { create, updateInfo } = useProjectMutations();

  /* 开启时以目标项目（或空表单 + 预选类型）重置，关闭残留不带入下次；
     ContentEditor 的 initValue 非受控，值切换经 ref 同步 */
  useEffect(() => {
    if (!open) return;
    setTitle(project?.title ?? "");
    const nextDesc = project?.desc?.length ? project.desc : EMPTY_DESC;
    setDesc(nextDesc);
    editorRef.current?.setEditorValue(nextDesc);
    setProjectType(project?.projectType ?? defaultType);
  }, [open, project, defaultType]);

  const handleSave = () => {
    if (!title.trim()) {
      toast.warning("请输入项目名称");
      return;
    }
    setSaving(true);
    const action = editing
      ? updateInfo(project.id, title.trim(), desc).then(() => {
          onSaved?.();
          toast.success("项目已更新");
        })
      : create({ title: title.trim(), desc, projectType }).then(created => {
          onCreated?.(created);
          toast.success("项目已创建");
        });
    action
      .then(() => onClose())
      .catch(() => {
        toast.error(editing ? "保存失败" : "创建项目失败");
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
      title={editing ? "编辑项目" : "新建项目"}
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
      <div className="flex flex-col gap-3.5">
        {editing ? (
          <div className="text-ink-2 flex items-center gap-2 text-[12.5px]">
            <TypeBadge type={projectType} />
            <span className="text-ink-3">类型创建后不可更改</span>
          </div>
        ) : (
          <div role="radiogroup" aria-label="项目类型" className="grid grid-cols-3 gap-2">
            {PROJECT_TYPE_KEYS.map(key => {
              const meta = PROJECT_TYPE_META[key];
              const active = projectType === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setProjectType(key)}
                  className={cn(
                    "ease-tau-out flex flex-col items-start gap-2 rounded-[12px] border px-3 pb-2.5 pt-3 text-left outline-none transition-[background,border-color,box-shadow] duration-150 focus-visible:shadow-[var(--tau-focus-ring)]",
                    active ? "border-accent bg-accent-soft" : "border-line-1 hover:bg-hover"
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-[9px]",
                      meta.softClass,
                      meta.textClass
                    )}
                  >
                    <meta.icon className="size-4" strokeWidth={1.75} />
                  </span>
                  <span>
                    <span className="text-ink-1 block text-[13px] font-semibold">{meta.label}</span>
                    <span className="text-ink-3 mt-0.5 block text-[11.5px] leading-[1.5]">
                      {meta.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-ink-2 text-[12px]">名称</span>
          <Input
            data-autofocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="项目名称"
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
                ref={editorRef}
                initValue={desc}
                readonly={false}
                onChange={setDesc}
                placeHolder="介绍一下这个项目（/ 唤起块菜单）"
                className="text-tau-body overflow-hidden"
              />
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** 编辑态的类型只读徽章（类型色图标 + 名称） */
function TypeBadge({ type }: { type: CreateProjectInput["projectType"] }) {
  const meta = PROJECT_TYPE_META[type];
  return (
    <span className="text-ink-1 inline-flex items-center gap-1.5 font-medium">
      <span
        className={cn(
          "grid size-5 place-items-center rounded-[6px]",
          meta.softClass,
          meta.textClass
        )}
      >
        <meta.icon className="size-3" strokeWidth={1.75} />
      </span>
      {meta.label}
    </span>
  );
}
