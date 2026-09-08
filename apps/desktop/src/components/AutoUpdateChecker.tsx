import useAutoUpdateCheck from "@/hooks/useAutoUpdateCheck";

/** 挂载在 antd App 上下文内，负责更新事件监听与启动自动检查 */
const AutoUpdateChecker = () => {
  useAutoUpdateCheck();
  return null;
};

export default AutoUpdateChecker;
