import type { ReactNode } from "react";
import { CloudOff } from "lucide-react";
import { Button, Loading, Panel } from "@tau/ui";
import type { Submission } from "../../../../contracts";
import { errorMessage } from "../../api/errors";
import { ErrorState } from "../../components/states";
import type { useSubmissionList } from "./queries";

/** 提交列表的加载 / 失败 / 空态 / 分页外壳；行渲染由调用方决定 */
export function SubmissionList({
  query,
  empty,
  renderRow,
}: {
  query: ReturnType<typeof useSubmissionList>;
  empty: ReactNode;
  renderRow: (submission: Submission) => ReactNode;
}) {
  if (query.isPending) return <Loading minHeight={240} />;
  if (query.isError && !query.data)
    return (
      <ErrorState
        icon={CloudOff}
        title="无法加载提交列表"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isRefetching}
      />
    );
  const items = query.data.pages.flatMap(page => page.items);
  if (!items.length) return <>{empty}</>;
  return (
    <>
      <Panel pad="none" className="overflow-hidden">
        <ul className="divide-line-1 flex flex-col divide-y">{items.map(renderRow)}</ul>
      </Panel>
      {query.isFetchNextPageError && (
        <p role="alert" className="text-tau-sm text-danger mt-3 text-center">
          加载更多失败：{errorMessage(query.error)}
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
}
