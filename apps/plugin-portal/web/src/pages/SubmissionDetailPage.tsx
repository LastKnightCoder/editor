import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CloudOff, SearchX } from "lucide-react";
import { Button, Loading } from "@tau/ui";
import { hasCode } from "../api/errors";
import { queryKeys, useApi } from "../app/api";
import { ErrorState } from "../components/states";
import { SubmissionView } from "../features/submission/SubmissionView";

export function SubmissionDetailPage() {
  const { id = "" } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: queryKeys.submission(id),
    queryFn: () => api.getSubmission(id),
    refetchOnWindowFocus: true,
  });
  const back = <Button onClick={() => navigate("/submissions")}>返回我的提交</Button>;

  if (query.isPending) return <Loading />;
  if (query.isError && !query.data) {
    if (hasCode(query.error, "NOT_FOUND")) {
      return (
        <ErrorState
          icon={SearchX}
          title="找不到这条提交"
          error={new Error("它可能不存在，或属于其他账号。")}
          actions={back}
        />
      );
    }
    return (
      <ErrorState
        icon={CloudOff}
        title="无法加载提交"
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isRefetching}
        actions={back}
      />
    );
  }
  const submission = query.data;
  return <SubmissionView key={submission.id} submission={submission} />;
}
