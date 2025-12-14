import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useModuleStore } from "@/stores/useModuleStore";
import styles from "./index.module.less";

interface FullScreenLoadingProps {
  /** 窗口类型，用于确定需要初始化哪些模块 */
  windowType: string;
  /** 子组件 */
  children: React.ReactNode;
  /** 是否跳过加载（如 Markdown 编辑器） */
  skipLoading?: boolean;
  /** 显示 Loading 的延迟时间（ms），防止快速闪烁 */
  showDelay?: number;
}

const FullScreenLoading: React.FC<FullScreenLoadingProps> = ({
  windowType,
  children,
  skipLoading = false,
  showDelay = 1000,
}) => {
  const { isInitializing, failedModules, initForWindow, clearFailedModules, initListeners } =
    useModuleStore();

  const [initialized, setInitialized] = useState(false);
  const [showError, setShowError] = useState(false);
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    // 初始化监听器
    initListeners();
  }, [initListeners]);

  // 延迟显示 Loading，防止快速闪烁
  useEffect(() => {
    if (skipLoading || initialized) return;

    const timer = setTimeout(() => {
      if (!initialized) {
        setShowLoading(true);
      }
    }, showDelay);

    return () => clearTimeout(timer);
  }, [skipLoading, initialized, showDelay]);

  useEffect(() => {
    if (skipLoading) {
      setInitialized(true);
      return;
    }

    const init = async () => {
      const result = await initForWindow(windowType);
      setInitialized(true);
      setShowLoading(false);

      if (!result.success && result.failedModules.length > 0) {
        setShowError(true);
      }
    };

    init();
  }, [windowType, skipLoading, initForWindow]);

  // 如果跳过加载，直接渲染子组件
  if (skipLoading) {
    return <>{children}</>;
  }

  // 显示 Loading（仅当延迟后仍在初始化时）
  if ((isInitializing || !initialized) && showLoading) {
    return (
      <div className={styles.container}>
        <Loader2 className={styles.spinner} size={32} />
      </div>
    );
  }

  // 初始化中但还没到显示 Loading 的时间，显示空白
  if (isInitializing || !initialized) {
    return <div className={styles.container} />;
  }

  // 显示错误
  if (showError && failedModules.length > 0) {
    return (
      <div className={styles.container}>
        <div className={styles.errorContent}>
          <div className={styles.errorTitle}>部分功能初始化失败</div>
          <div className={styles.errorList}>
            {failedModules.map(({ name, error }) => (
              <div key={name} className={styles.errorItem}>
                <span className={styles.moduleName}>{name}</span>
                <span className={styles.errorMessage}>{error}</span>
              </div>
            ))}
          </div>
          <div className={styles.errorHint}>部分功能可能不可用</div>
          <button
            className={styles.continueBtn}
            onClick={() => {
              clearFailedModules();
              setShowError(false);
            }}
          >
            继续使用
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default FullScreenLoading;
