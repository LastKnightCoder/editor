/** 作者侧协作码的查询与操作（协作码块、面板顶栏 chip、更多菜单共用一份缓存） */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@tau/ui";
import { generateCollaborationInvitation, getCurrentCollaborationInvitation } from "@/commands";
import { errorText, formatInvitationCode } from "./model";

const invitationKey = (documentId: string) => ["collaboration", "invitation", documentId];

/**
 * 作者侧当前协作码（本机缓存的明文，不轮换）与操作；同一内容的多处展示共用一份查询缓存。
 * rotate：没有可用码时即「生成」，已有码时轮换（旧码立即失效，已加入成员不受影响）。
 */
export function useInvitation(documentId: string, enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: invitationKey(documentId),
    queryFn: () => getCurrentCollaborationInvitation(documentId),
    staleTime: 60_000,
    enabled,
  });
  const [rotating, setRotating] = useState(false);
  const data = query.data ?? null;
  const rotate = async () => {
    setRotating(true);
    try {
      const next = await generateCollaborationInvitation(documentId);
      queryClient.setQueryData(invitationKey(documentId), next);
      if (data) toast.success("已轮换协作码，旧码不能再申请加入");
    } catch (error) {
      toast.error(errorText(error, "生成协作码失败"));
    } finally {
      setRotating(false);
    }
  };
  const copy = async () => {
    if (!data) return false;
    try {
      await navigator.clipboard.writeText(formatInvitationCode(data.code));
    } catch {
      // 窗口失焦等场景 clipboard 会拒绝写入，错误是技术文案，给统一提示
      toast.error("复制失败，请重试");
      return false;
    }
    toast.success("协作码已复制");
    return true;
  };
  return { data, loading: query.isPending && enabled, rotating, rotate, copy };
}
