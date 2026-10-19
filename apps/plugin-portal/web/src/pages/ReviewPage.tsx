import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CloudOff, SearchX, ShieldOff } from "lucide-react";
import { Button, Loading } from "@tau/ui";
import { hasCode } from "../api/errors";
import { queryKeys, useApi } from "../app/api";
import { useSession } from "../app/session";
import { ErrorState, StateBlock } from "../components/states";
import { ReviewView, type QueueNeighbors } from "../features/submission/ReviewView";
import { useSubmissionList } from "../features/submissions/queries";

/**
 * 进入审核页时记下待审队列的顺序：审完一条它会离开队列，
 * 用快照才能继续给出「下一条」。
 */
function useQueueNeighbors(id: string): QueueNeighbors | null {
  const queue = useSubmissionList("review", "pending_review");
  const [snapshot, setSnapshot] = useState<string[] | null>(null);
  const ids = useMemo(
    () => queue.data?.pages.flatMap(page => page.items.map(item => item.id)),
    [queue.data]
  );
  useEffect(() => {
    if (ids && (!snapshot || !snapshot.includes(id))) setSnapshot(ids);
  }, [ids, snapshot, id]);
  if (!snapshot) return null;
  const index = snapshot.indexOf(id);
  if (index < 0) return null;
  return {
    position: index + 1,
    total: snapshot.length,
    prev: snapshot[index - 1] ?? null,
    next: snapshot[index + 1] ?? null,
  };
}

function ReviewContent({ id }: { id: string }) {
  const api = useApi();
  const navigate = useNavigate();
  const neighbors = useQueueNeighbors(id);
  const query = useQuery({
    queryKey: queryKeys.submission(id),
    queryFn: () => api.getSubmission(id),
    refetchOnWindowFocus: true,
  });
  const back = <Button onClick={() => navigate("/review")}>返回审核队列</Button>;
  if (query.isPending) return <Loading />;
  if (query.isError && !query.data)
    return hasCode(query.error, "NOT_FOUND") ? (
      <ErrorState
        icon={SearchX}
        title="找不到这条提交"
        error={new Error("它可能不存在，或者还没有提交审核。")}
        actions={back}
      />
    ) : (
      <ErrorState
        icon={CloudOff}
        title="无法加载提交"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isRefetching}
        actions={back}
      />
    );
  return <ReviewView key={query.data.id} submission={query.data} neighbors={neighbors} />;
}

export function ReviewPage() {
  const { id = "" } = useParams();
  const session = useSession();
  if (session.isPending) return <Loading />;
  if (!session.data?.reviewer)
    return (
      <StateBlock icon={ShieldOff} title="只有审核者可以审核提交">
        审核者由发布服务配置，作者账号不能自行开启。
      </StateBlock>
    );
  return <ReviewContent id={id} />;
}
