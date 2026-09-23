/**
 * 项目详情视图（诚实占位）：仅呈现项目身份（标题 / 类型 / 描述摘要 / 子项数），
 * 三型工作台本体（文档树编辑 / 数据表格 / Vibe Learning）尚未迁移——
 * 不造演示数据、不放假入口，迁移后由此页接管。
 */

import { ArrowLeft } from "lucide-react";
import { usePage, usePageParams } from "@/page/PageProvider";
import { Button, Loading } from "@tau/ui";
import { useProjectDetail, useProjectItemCounts, projectExcerpt } from "../queries";
import { projectTypeMeta } from "../projectTypeMeta";

export function ProjectDetailView() {
  const { id } = usePageParams<{ id: number }>();
  const { project, loading } = useProjectDetail(id);
  const { counts } = useProjectItemCounts();
  const { navigator } = usePage();

  if (loading) return <Loading />;
  const meta = project ? projectTypeMeta(project.projectType) : null;
  const Icon = meta?.icon;
  const itemCount = project ? (counts[project.id] ?? 0) : 0;

  return (
    <div className="flex h-full items-center justify-center">
      <div className="bg-surface shadow-card mx-auto flex w-[460px] flex-col items-center rounded-[var(--tau-radius-lg)] px-8 py-7 text-center">
        {project && Icon && meta ? (
          <>
            <span
              className={`grid size-11 place-items-center rounded-[13px] ${meta.softClass} ${meta.textClass}`}
            >
              <Icon className="size-5" strokeWidth={1.9} />
            </span>
            <p className="text-ink-1 mt-3 text-[15.5px] font-semibold">
              {project.title || `项目 #${project.id}`}
            </p>
            <p className="text-ink-3 mt-1 text-[12px]">
              {meta.label} · {itemCount} 个文档
            </p>
            {projectExcerpt(project.desc) && (
              <p className="text-ink-2 mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed">
                {projectExcerpt(project.desc)}
              </p>
            )}
          </>
        ) : (
          <p className="text-ink-1 text-[15px] font-medium">项目不存在或已删除</p>
        )}
        <p className="text-ink-2 mt-3 text-[12.5px] leading-relaxed">
          项目工作台（文档树 / 数据表格 / Vibe Learning）尚未迁移到新架构，
          <br />
          将在本域后续版本接管此页。
        </p>
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
