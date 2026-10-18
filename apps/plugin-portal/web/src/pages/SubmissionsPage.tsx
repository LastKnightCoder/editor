import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronRight, CloudOff, PackagePlus, Plus } from "lucide-react";
import { Button, Loading, Panel } from "@tau/ui";
import type { Submission } from "../../../contracts";
import { queryKeys, useApi } from "../app/api";
import { PageHeader, StatusTag } from "../components/PageHeader";
import { ErrorState, StateBlock } from "../components/states";
import { formatTime } from "../components/format";
import { useSession } from "../app/session";

function NewButton() {
  const navigate = useNavigate();
  return (
    <Button variant="primary" icon={Plus} onClick={() => navigate("/submissions/new")}>
      新建提交
    </Button>
  );
}

function SubmissionRow({ submission }: { submission: Submission }) {
  const manifest = submission.content?.manifest;
  const pending = submission.status === "pending_review";
  return (
    <li>
      <Link
        to={`/submissions/${encodeURIComponent(submission.id)}`}
        className="hover:bg-surface-hover focus-visible:bg-surface-hover flex items-center gap-4 px-5 py-4 outline-none transition-colors"
      >
        <span className="bg-hover text-ink-3 rounded-tau-sm grid size-11 shrink-0 place-items-center">
          <PackagePlus size={18} strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="text-tau-body text-ink-1 truncate font-medium">
              {manifest?.name ?? "未上传插件包"}
            </span>
            {manifest && (
              <span className="text-tau-micro text-ink-3 font-tau-mono shrink-0">
                v{manifest.version}
              </span>
            )}
          </p>
          <p className="text-tau-sm text-ink-2 truncate">
            {manifest?.description || "上传插件包后自动读取简介"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusTag status={submission.status} />
          <span className="text-tau-micro text-ink-3">
            {pending
              ? `提交于 ${formatTime(submission.submittedAt)}`
              : `更新于 ${formatTime(submission.updatedAt)}`}
          </span>
        </div>
        <ChevronRight size={16} className="text-ink-3 shrink-0" />
      </Link>
    </li>
  );
}

export function SubmissionsPage() {
  const api = useApi();
  const session = useSession();
  const [review, setReview] = useState(false);
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.submissions, review],
    queryFn: ({ pageParam }) => api.listSubmissions(pageParam, review),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor,
    refetchOnWindowFocus: true,
  });
  const items = query.data?.pages.flatMap(page => page.items) ?? [];

  let body;
  if (query.isPending) body = <Loading minHeight={240} />;
  else if (query.isError && !query.data)
    body = (
      <ErrorState
        icon={CloudOff}
        title="无法加载提交列表"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isRefetching}
      />
    );
  else if (items.length === 0)
    body = (
      <StateBlock icon={PackagePlus} title="还没有提交" actions={<NewButton />}>
        上传包含 README.md 的插件 ZIP，关联源码仓库即可提交审核。
      </StateBlock>
    );
  else
    body = (
      <>
        <Panel pad="none" className="overflow-hidden">
          <ul className="divide-line-1 flex flex-col divide-y">
            {items.map(item => (
              <SubmissionRow key={item.id} submission={item} />
            ))}
          </ul>
        </Panel>
        {query.isFetchNextPageError && (
          <p className="text-tau-sm text-danger mt-3 text-center">
            加载更多失败：{query.error?.message}
          </p>
        )}
        {query.hasNextPage && (
          <div className="mt-4 flex justify-center">
            <Button loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              加载更多
            </Button>
          </div>
        )}
      </>
    );

  return (
    <>
      <PageHeader
        title={review ? "审核管理" : "我的提交"}
        meta="介绍与使用说明来自插件包；审核意见直接在站内交流。"
        actions={items.length > 0 && <NewButton />}
      />
      {session.data?.reviewer && (
        <Link to="/moderation" className="text-accent-text ml-3">
          评论管理
        </Link>
      )}
      {session.data?.reviewer && (
        <Button onClick={() => setReview(value => !value)}>
          {review ? "查看我的提交" : "进入审核管理"}
        </Button>
      )}
      {body}
    </>
  );
}
