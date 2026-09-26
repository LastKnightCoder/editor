/**
 * 生成应用的宿主：8 个生成弹窗 + PPT / 报告的 AI 编辑弹窗。
 * 入口在目录「产物」组的 ＋ 菜单与阅读区底部「基于这份资料」；
 * 后者经 setVLGenerationScope 让弹窗只预选当前这份资料。
 */

import { forwardRef, memo, useImperativeHandle, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { setVLGenerationScope } from "@/hooks/useVLResourceSelection";
import type { VLNote } from "@/types/vibe-learning";
import type { GenerateAppKey } from "../appMeta";

import QuizGenerateModal from "./apps/QuizGenerateModal";
import OutlineGenerateModal from "./apps/OutlineGenerateModal";
import HighlightsGenerateModal from "./apps/HighlightsGenerateModal";
import ArticleGenerateModal from "./apps/ArticleGenerateModal";
import MindMapGenerateModal from "./apps/MindMapGenerateModal";
import PPTGenerateModal from "./apps/PPTGenerateModal";
import PPTEditModal from "./apps/PPTEditModal";
import ReportGenerateModal from "./apps/ReportGenerateModal";
import ReportEditModal from "./apps/ReportEditModal";
import PodcastGenerateModal from "./apps/PodcastGenerateModal";

export interface GenerationHostRef {
  /** 打开生成弹窗；传 resourceId 时只预选这一份资料 */
  open: (key: GenerateAppKey, resourceId?: number) => void;
  editPPT: (note: VLNote) => void;
  editReport: (note: VLNote) => void;
}

interface GenerationHostProps {
  projectId: number;
  mainDbName: string;
  /** 笔记类产物有增删改（列表刷新） */
  onNotesChange: () => void;
  /** PPT / 报告经 AI 编辑改了内容 */
  onNoteEdited: () => void;
  /** 生成出一篇笔记：刷新并在阅读区打开 */
  onNoteCreated: (note: VLNote) => void;
  /** 测验集有变化 */
  onQuizSetsChange: () => void;
}

const GenerationHost = memo(
  forwardRef<GenerationHostRef, GenerationHostProps>((props, ref) => {
    const { projectId, mainDbName, onNotesChange, onNoteEdited, onNoteCreated, onQuizSetsChange } =
      props;
    const [active, setActive] = useState<GenerateAppKey | null>(null);
    const [editing, setEditing] = useState<{ kind: "ppt" | "report"; note: VLNote } | null>(null);

    useImperativeHandle(ref, () => ({
      open: (key, resourceId) => {
        setVLGenerationScope(resourceId === undefined ? null : [resourceId]);
        setActive(key);
      },
      editPPT: note => {
        setVLGenerationScope(null);
        setEditing({ kind: "ppt", note });
      },
      editReport: note => {
        setVLGenerationScope(null);
        setEditing({ kind: "report", note });
      },
    }));

    // 关闭后稍等再刷新：生成任务在弹窗关闭时才落库最后一段
    const handleClose = useMemoizedFn(() => {
      const closing = active;
      setActive(null);
      setTimeout(() => (closing === "quiz" ? onQuizSetsChange() : onNotesChange()), 100);
    });

    const common = { projectId, mainDbName, onClose: handleClose };

    return (
      <>
        <OutlineGenerateModal
          {...common}
          open={active === "outline"}
          onNoteCreated={onNoteCreated}
        />
        <HighlightsGenerateModal
          {...common}
          open={active === "highlights"}
          onNoteCreated={onNoteCreated}
        />
        <ArticleGenerateModal
          {...common}
          open={active === "article"}
          onNoteCreated={onNoteCreated}
        />
        <MindMapGenerateModal
          {...common}
          open={active === "mindmap"}
          onNoteCreated={onNoteCreated}
        />
        <PPTGenerateModal {...common} open={active === "ppt"} onNoteCreated={onNoteCreated} />
        <ReportGenerateModal {...common} open={active === "report"} onNoteCreated={onNoteCreated} />
        <QuizGenerateModal {...common} open={active === "quiz"} />
        <PodcastGenerateModal
          {...common}
          open={active === "podcast"}
          onNoteCreated={onNoteCreated}
        />

        <PPTEditModal
          open={editing?.kind === "ppt"}
          note={editing?.kind === "ppt" ? editing.note : null}
          projectId={projectId}
          mainDbName={mainDbName}
          onClose={() => setEditing(null)}
          onNoteUpdated={onNoteEdited}
        />
        <ReportEditModal
          open={editing?.kind === "report"}
          note={editing?.kind === "report" ? editing.note : null}
          projectId={projectId}
          mainDbName={mainDbName}
          onClose={() => setEditing(null)}
          onNoteUpdated={onNoteEdited}
        />
      </>
    );
  })
);

GenerationHost.displayName = "GenerationHost";

export default GenerationHost;
