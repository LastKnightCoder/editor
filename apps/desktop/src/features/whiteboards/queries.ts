import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getWhiteBoardContentById, updateWhiteBoardContent } from "@/commands/white-board";
import useSettingStore from "@/stores/useSettingStore";
import { toast } from "@tau/ui";

export function useWhiteBoardContent(id: number) {
  const database = useSettingStore(state => state.setting.database.active);
  const queryClient = useQueryClient();
  const queryKey = ["whiteboard-content", database, id];
  const query = useQuery({ queryKey, queryFn: () => getWhiteBoardContentById(id) });
  const save = useMutation({
    scope: { id: `whiteboard-content-${database}-${id}` },
    mutationFn: (content: Parameters<typeof updateWhiteBoardContent>[0]) => {
      if (useSettingStore.getState().setting.database.active !== database) {
        throw new Error("数据库已切换，取消旧白板写入");
      }
      return updateWhiteBoardContent(content);
    },
    onSuccess: content => queryClient.setQueryData(queryKey, content),
    onError: () => toast.error("白板保存失败，请重试"),
  });
  return { ...query, save };
}
