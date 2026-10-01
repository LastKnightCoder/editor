/**
 * 项目详情视图（薄壳）：文档树工作台的宿主——判存在 + 面包屑注入后渲染
 * components/ProjectView。
 *
 * ProjectView 系为 legacy 搬迁件（原 src/pages/ProjectView，2026-09-23 迁入，
 * 见 DECISIONS.md D-033）：antd 皮 / module.less 等违反随迁保留，
 * 换皮阶段统一处理；此处不做任何样式适配。
 */

import { useMemo } from "react";
import { ArrowLeft, PanelLeft } from "lucide-react";
import { usePage, usePageParams, usePageBreadcrumb } from "@/page/PageProvider";
import { Button, IconButton, Loading, Tooltip } from "@tau/ui";
import { useProjectDetail, useRecordProjectOpen } from "../queries";
import { useProjectTreeStore } from "../projectTreeStore";
import ProjectView from "../components/ProjectView";

export function ProjectDetailView() {
  const { id, itemId } = usePageParams<{ id: number; itemId?: number }>();
  const { project, loading } = useProjectDetail(id);
  useRecordProjectOpen(id, itemId, !!project);
  const { navigator } = usePage();
  const treeCollapsed = useProjectTreeStore(s => s.collapsed);
  const toggleTree = useProjectTreeStore(s => s.toggle);

  /* 标题栏面包屑（node 须 useMemo 稳定化）：文档树切换按钮 + 项目标题。
     按钮钉在标题栏固定位置，收起/展开只换图标，不随侧栏移动 */
  const breadcrumbNode = useMemo(
    () => (
      <span className="flex min-w-0 items-center gap-1">
        {!!project && (
          <Tooltip content={treeCollapsed ? "展开侧边栏" : "收起侧边栏"} placement="bottom">
            <IconButton
              className="shrink-0"
              onClick={toggleTree}
              aria-label={treeCollapsed ? "展开侧边栏" : "收起侧边栏"}
              aria-expanded={!treeCollapsed}
            >
              <PanelLeft size={17} strokeWidth={1.75} />
            </IconButton>
          </Tooltip>
        )}
        <span className="text-tau-meta text-ink-2 min-w-0 truncate px-1.5 py-0.5">
          {project?.title || `项目 #${id}`}
        </span>
      </span>
    ),
    [project, id, treeCollapsed, toggleTree]
  );
  usePageBreadcrumb("project-detail", breadcrumbNode);

  if (loading) return <Loading />;

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="bg-surface shadow-card mx-auto flex w-[460px] flex-col items-center rounded-[var(--tau-radius-lg)] px-8 py-7 text-center">
          <p className="text-ink-1 text-[15px] font-medium">项目不存在或已删除</p>
          <Button
            variant="secondary"
            size="sm"
            icon={ArrowLeft}
            className="mt-4"
            onClick={() => navigator.back()}
          >
            返回项目列表
          </Button>
        </div>
      </div>
    );
  }

  return <ProjectView projectId={id} itemId={itemId} />;
}
