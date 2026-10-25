/**
 * 旧快照白板升级到文档格式的入口（数据升级，存量转换完成后随转换代码一起删除）：
 * 普通打开只读预览，不自动转换；用户确认后整块白板一次转换。
 * 失败时原内容不变，再次转换沿用主进程固定的原操作。
 */

import { useState } from "react";
import { ConfirmDialog, Button, toast } from "@tau/ui";
import { queryClient } from "@/queryClient";
import { convertLegacyWhiteboard } from "@/commands/whiteboard-document";
import { getWhiteboardBodyKit } from "@/features/shared/whiteboard/editorKit";
import useSettingStore from "@/stores/useSettingStore";
import { desktopContentPlugins } from "../../../../shared/content-plugins";
import { remoteFailureText } from "@/services/whiteboard-documents/remote";

export function WhiteboardFormatUpgrade({ contentId }: { contentId: number }) {
  const databaseName = useSettingStore(state => state.setting.database.active);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="soft" className="flex-none" onClick={() => setOpen(true)}>
        转换格式
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="转换为新格式"
        description="转换会把这块白板的全部页面改用新格式保存，元素、文字和引用保持不变，未安装插件的元素原样保留。转换失败时原白板不受影响，可以再次转换。"
        impact="转换完成后不能退回旧格式"
        confirmText="开始转换"
        loadingText="正在转换…"
        onConfirm={async () => {
          try {
            const { dictionary } = await desktopContentPlugins.prepareEditorContracts(
              getWhiteboardBodyKit().extensions
            );
            await convertLegacyWhiteboard(databaseName, contentId, dictionary);
            await queryClient.invalidateQueries({
              predicate: query =>
                ["whiteboards", "whiteboard-content"].includes(String(query.queryKey[0])),
            });
            toast.success("已转换为新格式");
          } catch (error) {
            toast.error(remoteFailureText(error));
            throw error;
          }
        }}
      />
    </>
  );
}
