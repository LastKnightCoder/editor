import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys, useApi } from "../../app/api";

export const reviewKey = (submissionId: string) => ["reviews", submissionId] as const;

/** 审核记录与发布状态；发布进行中每 3 秒刷新一次 */
export function useReviewDetails(submissionId: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: reviewKey(submissionId),
    queryFn: () => api.getReviews(submissionId),
    enabled,
    refetchOnWindowFocus: true,
    refetchInterval: query =>
      ["pending", "publishing"].includes(query.state.data?.release?.state ?? "") ? 3000 : false,
  });
}

/** 审核决定或发布状态变化后，提交详情、列表与计数一起刷新 */
export function useRefreshSubmission(submissionId: string) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: reviewKey(submissionId) }),
      client.invalidateQueries({ queryKey: queryKeys.submission(submissionId) }),
      client.invalidateQueries({ queryKey: queryKeys.submissions }),
    ]);
}
