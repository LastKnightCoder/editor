import ProjectList from "./ProjectList";
import EditProjectView from "./EditProjectView";
import { Button } from "@tau/ui";
import ProjectContext, { type ProjectDocumentAction } from "./ProjectContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProjectDetail } from "@/features/projects/queries";
import { Loader2 } from "lucide-react";
import { usePage } from "@/page/PageProvider";
import { useDatabaseChangeEffect } from "@/hooks/useDatabaseChangeEffect";

interface ProjectViewProps {
  projectId: number;
  /** 定位到文档树内具体条目（命令面板/外部跳转用，列表进入不带） */
  itemId?: number;
}

const ProjectView = ({ projectId, itemId }: ProjectViewProps) => {
  const { navigator } = usePage();
  const [documentAction, setDocumentAction] = useState<ProjectDocumentAction | null>(null);
  const clearDocumentAction = useCallback(() => setDocumentAction(null), []);
  const requestDocumentAction = useCallback(
    (action: ProjectDocumentAction) => {
      setDocumentAction(action);
      navigator.push("project-detail", { id: projectId, itemId: action.itemId });
    },
    [navigator, projectId]
  );

  useEffect(() => {
    setDocumentAction(action => (action && action.itemId !== itemId ? null : action));
  }, [projectId, itemId]);

  const queryClient = useQueryClient();
  const { project, loading } = useProjectDetail(projectId);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setContainerWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [project]);

  // 数据库连接或切换时整域失效（detail/tree/列表/关联源一并按新库重拉）
  useDatabaseChangeEffect(() => {
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
  }, []);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.75} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="bg-surface shadow-card rounded-tau-lg flex flex-col items-center gap-3 px-8 py-7 text-center">
          <p className="text-ink-1 text-[15px] font-medium">项目不存在或已被删除</p>
          <Button variant="secondary" size="sm" onClick={() => navigator.back()}>
            返回项目列表
          </Button>
        </div>
      </div>
    );
  }

  // 文档树：文档树与正文同装一张抬起的纸面（纸外 = 应用导航，纸内 = 本项目），
  // 靠纸面边缘与全局侧栏分界；纸内两栏同底，仅文档树右缘一条 1px 淡线兼作拖拽边界提示。
  // 纸面外距用外层 padding 而非 margin：margin-top 会穿过 PageHost 的块级包装折叠出去，
  // 把包装整体下推、撑出壳层 main 的滚动条
  return (
    <ProjectContext.Provider
      value={{
        projectId: projectId,
        itemId: itemId,
        containerWidth,
        documentAction,
        requestDocumentAction,
        clearDocumentAction,
      }}
    >
      <div className="h-full px-4 pb-4 pt-1">
        <div
          ref={containerRef}
          className="tau-sheet bg-surface shadow-card rounded-tau-lg relative flex h-full overflow-hidden"
        >
          <div className="h-full overflow-hidden">
            <ProjectList />
          </div>

          <div className="flex h-full flex-1 flex-col overflow-hidden">
            <div className="w-full flex-1 overflow-hidden">
              <EditProjectView />
            </div>
          </div>
        </div>
      </div>
    </ProjectContext.Provider>
  );
};

export default ProjectView;
