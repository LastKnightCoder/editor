/**
 * 项目详情视图（薄壳）：三型工作台的宿主——判存在 + 面包屑注入后渲染
 * components/ProjectView（内部按 projectType 分派文档树 / 数据表格 / Vibe Learning）。
 *
 * ProjectView 系为 legacy 搬迁件（原 src/pages/ProjectView，2026-09-23 迁入，
 * 见 DECISIONS.md D-033）：antd 皮 / module.less / useTabStore(navigateTo) 残留
 * 等 A2 违反随迁保留，换皮阶段统一处理；此处不做任何样式适配。
 */

import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { usePage, usePageParams, usePageBreadcrumb } from "@/page/PageProvider";
import { Button, Loading } from "@tau/ui";
import { useProjectDetail } from "../queries";
import ProjectView from "../components/ProjectView";

export function ProjectDetailView() {
  const { id, itemId } = usePageParams<{ id: number; itemId?: number }>();
  const { project, loading } = useProjectDetail(id);
  const { navigator } = usePage();

  /* 标题栏面包屑（node 须 useMemo 稳定化）：静态项目标题 */
  const breadcrumbNode = useMemo(
    () => (
      <span className="text-tau-meta text-ink-2 min-w-0 truncate px-1.5 py-0.5">
        {project?.title || `项目 #${id}`}
      </span>
    ),
    [project?.title, id]
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
