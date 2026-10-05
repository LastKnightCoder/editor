import useAutoUpdateCheck from "@/hooks/useAutoUpdateCheck";
import { ReleaseNotesDialog } from "@/features/release-notes/ReleaseNotesDialog";

/** 全局挂载一次：负责更新事件监听、启动自动检查与升级公告；发现新版本或刚升级时经 notify 弹通知 */
const AutoUpdateChecker = () => {
  useAutoUpdateCheck();
  return <ReleaseNotesDialog />;
};

export default AutoUpdateChecker;
