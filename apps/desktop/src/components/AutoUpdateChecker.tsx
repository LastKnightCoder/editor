import useAutoUpdateCheck from "@/hooks/useAutoUpdateCheck";
import { ReleaseNotesDialog } from "@/features/release-notes/ReleaseNotesDialog";
import { UpgradePromptHost } from "@/features/upgrade-prompt/UpgradePromptHost";

/** 全局挂载一次：负责更新事件监听、启动自动检查、升级公告与通用升级提示弹窗 */
const AutoUpdateChecker = () => {
  useAutoUpdateCheck();
  return (
    <>
      <ReleaseNotesDialog />
      <UpgradePromptHost />
    </>
  );
};

export default AutoUpdateChecker;
