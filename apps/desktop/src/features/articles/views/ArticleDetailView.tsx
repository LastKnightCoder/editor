/**
 * 文章详情视图（占位版）：承接列表页的页内跳转（替代独立窗口过渡动线，
 * 见 DECISIONS.md D-015 追记）。展示文章真实元信息 + 迁移说明；
 * 编辑器迁移后此视图替换为正文编辑布局，数据源（useArticleDetail）不变。
 */

import { usePage } from "@/page/PageProvider";
import { Loading } from "@tau/ui/Loading";
import { useArticleDetail } from "../queries";
import { formatWords } from "./ArticleCard";

export function ArticleDetailView() {
  const { state } = usePage();
  const entry = state.back[state.back.length - 1];
  const id = Number(entry?.params.id);
  const { data: article, loading } = useArticleDetail(id);

  if (loading) return <Loading />;
  if (!article) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="bg-surface shadow-card max-w-md rounded-[var(--tau-radius-lg)] px-8 py-6 text-center">
          <p className="text-ink-1 text-[15px] font-medium">文章不存在或已删除</p>
          <p className="text-ink-2 mt-2 text-[12.5px]">按 Esc 或后退返回文章列表</p>
        </div>
      </div>
    );
  }

  return (
    <div className="edge-fade-scroll h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[860px] flex-col px-[26px] pb-10 pt-10">
        <h1 className="text-[22px] font-semibold leading-[1.4] tracking-[-0.01em]">
          {article.title || `文章 #${article.id}`}
        </h1>
        <p className="text-ink-3 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] tabular-nums">
          <span>创建 {formatDate(article.create_time)}</span>
          <span>·</span>
          <span>编辑 {formatDate(article.update_time)}</span>
          <span>·</span>
          <span>{formatWords(article.count ?? 0)} 字</span>
          {article.tags.length > 0 && (
            <>
              <span>·</span>
              <span>{article.tags.join(" / ")}</span>
            </>
          )}
        </p>

        {/* 占位说明：正文编辑器未迁移，不渲染假正文 */}
        <div className="bg-group text-ink-2 mt-6 rounded-[var(--tau-radius-md)] px-4 py-3 text-[12.5px] leading-[1.7]">
          正文编辑器迁移中——当前页为详情占位，元信息为真实数据。
          迁移完成后此处接入编辑器，列表点击直达编辑。
        </div>
      </div>
    </div>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
