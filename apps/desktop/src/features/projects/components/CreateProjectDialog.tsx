/**
 * 新建 / 编辑项目弹窗（tau Dialog 皮，字段对齐 legacy EditProjectInfoModal：
 * 标题 + 富文本描述 + 类型三选）。
 * - 新建：类型可选，创建成功后由宿主跳转项目详情；
 * - 编辑：类型不可改（三型的工作台形态不同，创建后改型会破坏子项语义），
 *   只改标题与描述。
 */

import { useEffect, useRef, useState } from "react";
import type { Descendant } from "slate";
import type { EditorRef } from "@tau/editor/src";
import ContentEditor from "@/components/ContentEditor";
import ErrorBoundary from "@/components/ErrorBoundary";
import { EProjectType, type Project } from "@/types/project";
import { Button, Dialog, Input, toast } from "@tau/ui";
import { PROJECT_TYPE_META } from "../projectTypeMeta";
import { useProjectMutations, type CreateProjectInput } from "../queries";

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

const TYPE_KEYS = [
  EProjectType.DocumentTree,
  EProjectType.DataTable,
  EProjectType.VibeLearning,
] as const;

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
          <span className="text-ink-2 text-[12px]">类型</span>
          <div className="flex items-center gap-1.5">
            {TYPE_KEYS.map(key => {
              const active = projectType === key;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={editing}
                  onClick={() => setProjectType(key)}
                  className={
                    active
                      ? "bg-selected text-ink-1 rounded-full px-2.5 py-0.5 text-[12.5px] font-medium"
                      : "text-ink-2 hover:bg-hover hover:text-ink-1 rounded-full px-2.5 py-0.5 text-[12.5px]"
                  }
                >
                  {PROJECT_TYPE_META[key].label}
                </button>
              );
            })}
          </div>
          <p className="text-ink-3 text-[11.5px]">
            {PROJECT_TYPE_META[projectType].description}
            {editing && " · 类型创建后不可更改"}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-ink-2 text-[12px]">描述（可选）</span>
          <ErrorBoundary>
            <ContentEditor
              ref={editorRef}
              initValue={desc}
              readonly={false}
              onChange={setDesc}
              className="min-h-[160px]"
            />
          </ErrorBoundary>
        </div>
      </div>
    </Dialog>
  );
}
