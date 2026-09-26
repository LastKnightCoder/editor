/**
 * 生成入口的宿主：一次只挂一个配置弹窗（8 个生成应用 + PPT / 报告的 AI 编辑）。
 * 入口在目录「产物」组的 ＋ 菜单、阅读区底部「基于这份资料」与产物的「AI 编辑」；
 * 「基于这份资料」经 setVLGenerationScope 让弹窗只预选当前这份资料。
 */

import { forwardRef, memo, useImperativeHandle, useState } from "react";
import { setVLGenerationScope } from "@/hooks/useVLResourceSelection";
import type { VLNote } from "@/types/vibe-learning";
import type { GenerateAppKey } from "../appMeta";
import type { VLTaskKind } from "../tasks/store";
import { GenerateDialog } from "./GenerateDialog";

export interface GenerationHostRef {
  /** 打开生成配置；传 resourceId 时只预选这一份资料 */
  open: (key: GenerateAppKey, resourceId?: number) => void;
  editPPT: (note: VLNote) => void;
  editReport: (note: VLNote) => void;
}

export interface TaskStarted {
  taskId: string;
  kind: VLTaskKind;
  note?: VLNote;
  quizSetId?: number;
}

interface GenerationHostProps {
  projectId: number;
  mainDbName: string;
  /** 任务已启动：页面在阅读区打开它的执行过程 */
  onTaskStarted: (started: TaskStarted) => void;
}

const GenerationHost = memo(
  forwardRef<GenerationHostRef, GenerationHostProps>(
    ({ projectId, mainDbName, onTaskStarted }, ref) => {
      const [active, setActive] = useState<{
        kind: VLTaskKind;
        note?: VLNote;
        seq: number;
      } | null>(null);

      useImperativeHandle(ref, () => ({
        open: (kind, resourceId) => {
          setVLGenerationScope(resourceId === undefined ? null : [resourceId]);
          setActive({ kind, seq: Date.now() });
        },
        editPPT: note => {
          setVLGenerationScope(null);
          setActive({ kind: "ppt_edit", note, seq: Date.now() });
        },
        editReport: note => {
          setVLGenerationScope(null);
          setActive({ kind: "report_edit", note, seq: Date.now() });
        },
      }));

      if (!active) return null;
      return (
        <GenerateDialog
          key={active.seq}
          kind={active.kind}
          note={active.note}
          projectId={projectId}
          mainDbName={mainDbName}
          onClose={() => setActive(null)}
          onStarted={result => onTaskStarted({ ...result, kind: active.kind })}
        />
      );
    }
  )
);

GenerationHost.displayName = "GenerationHost";

export default GenerationHost;
