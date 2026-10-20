import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AppFeedbackDetail,
  AppFeedbackFilter,
  AppFeedbackUpdate,
} from "../../../../contracts";
import { useApi } from "../../app/api";

const ROOT = ["app-feedback"] as const;

export function useAppFeedbackList(filter: AppFeedbackFilter) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [...ROOT, "list", filter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.listAppFeedback(filter, pageParam),
    getNextPageParam: page => page.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
  });
}

export function useAppFeedbackDetail(id: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...ROOT, "detail", id],
    queryFn: () => api.getAppFeedback(id as string),
    enabled: !!id,
  });
}

export function useUpdateAppFeedback(id: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AppFeedbackUpdate) => api.updateAppFeedback(id, input),
    onSuccess: async detail => {
      client.setQueryData<AppFeedbackDetail>([...ROOT, "detail", id], detail);
      await client.invalidateQueries({ queryKey: [...ROOT, "list"] });
    },
    // 版本冲突说明别处改过：重新拉取详情，让管理员基于最新状态再操作
    onError: () => client.invalidateQueries({ queryKey: [...ROOT, "detail", id] }),
  });
}

/** 附件经管理员会话取回，转成 object URL 供 img / 下载使用，卸载时释放 */
export function useAttachmentUrl(feedbackId: string, attachmentId: string) {
  const api = useApi();
  const blob = useQuery({
    queryKey: [...ROOT, "attachment", feedbackId, attachmentId],
    queryFn: () => api.getAppFeedbackAttachment(feedbackId, attachmentId),
    staleTime: Infinity,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob.data) return;
    const next = URL.createObjectURL(blob.data);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob.data]);
  return { url, isError: blob.isError, error: blob.error };
}
