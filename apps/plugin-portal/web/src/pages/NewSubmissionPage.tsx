import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudOff } from "lucide-react";
import { Button, Loading } from "@tau/ui";
import { queryKeys, useApi } from "../app/api";
import { ErrorState } from "../components/states";

const REQUEST_KEY = "tau-portal:new-request";

/** 同一标签页内的新建请求 ID：刷新或重试复用，服务端据此返回同一草稿 */
function pendingRequestId(): string {
  try {
    const saved = sessionStorage.getItem(REQUEST_KEY);
    if (saved) return saved;
    const created = crypto.randomUUID();
    sessionStorage.setItem(REQUEST_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function clearRequestId() {
  try {
    sessionStorage.removeItem(REQUEST_KEY);
  } catch {
    /* 无存储时每次进入都是新的请求 */
  }
}

/** 进入即创建草稿并跳转详情；之后上传、保存都在详情页进行 */
export function NewSubmissionPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const requestId = useRef(pendingRequestId());
  const create = useMutation({
    mutationFn: () => api.createSubmission(requestId.current),
    onSuccess: submission => {
      clearRequestId();
      queryClient.setQueryData(queryKeys.submission(submission.id), submission);
      void queryClient.invalidateQueries({ queryKey: queryKeys.submissions });
      navigate(`/submissions/${encodeURIComponent(submission.id)}`, { replace: true });
    },
  });
  const started = useRef(false);
  const { mutate } = create;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mutate();
  }, [mutate]);

  if (create.isError) {
    return (
      <ErrorState
        icon={CloudOff}
        title="草稿创建失败"
        error={create.error}
        onRetry={() => create.mutate()}
        actions={<Button onClick={() => navigate("/submissions")}>返回列表</Button>}
      />
    );
  }
  return <Loading label="正在创建草稿…" />;
}
