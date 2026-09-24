import useAutoUpdateCheck from "@/hooks/useAutoUpdateCheck";

/** 全局挂载一次：负责更新事件监听与启动自动检查，发现新版本经 notify 弹通知 */
const AutoUpdateChecker = () => {
  useAutoUpdateCheck();
  return null;
};

export default AutoUpdateChecker;
