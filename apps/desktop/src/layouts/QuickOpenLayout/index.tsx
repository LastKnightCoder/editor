import { Outlet, useSearchParams, useLocation } from "react-router-dom";

import styles from "./index.module.less";
import { PushpinOutlined, SunOutlined, MoonOutlined } from "@ant-design/icons";
import TitlebarIcon from "@/components/TitlebarIcon";
import { useState } from "react";
import classnames from "classnames";
import { setAlwaysOnTop as setTop } from "@/commands";
import { platform, isMac } from "@/platform";
import useSettingStore from "@/stores/useSettingStore";
import FullScreenLoading from "@/components/FullScreenLoading";
import GlobalTitlebar from "@/layouts/ContentLayout/components/GlobalTitlebar";
import { ToastHost } from "@tau/ui";

interface QuickOpenLayoutProps {
  title?: string;
}

/**
 * 根据路由路径推断窗口类型
 */
function getWindowTypeFromPath(pathname: string): string {
  if (pathname.includes("single-markdown-editor")) return "markdown";
  if (pathname.includes("todo")) return "todo";
  if (pathname.includes("pomodoro/mini")) return "pomodoro-mini";
  if (pathname.includes("pomodoro/immersive")) return "pomodoro-immersive";
  if (pathname.includes("pomodoro")) return "pomodoro";
  if (pathname.includes("quick-card")) return "quick-card";
  return "main"; // 未识别的路由按主窗口所需模块初始化
}

const QuickOpenLayout = ({ title }: QuickOpenLayoutProps) => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  // 标题栏承载窗口控制与置顶等桌面专属能力，Web 端不渲染
  const showTitlebar =
    platform.supports("window.minimize") && (isMac || searchParams.get("showTitlebar") === "true");
  const isDefaultTop = searchParams.get("isDefaultTop") === "true";

  // 推断窗口类型
  const windowType = getWindowTypeFromPath(location.pathname);
  // Markdown 编辑器跳过加载等待
  const skipLoading = windowType === "markdown";

  const isDark = useSettingStore(state => state.setting.darkMode);
  const onDarkModeChange = useSettingStore(state => state.onDarkModeChange);

  const [alwaysOnTop, setAlwaysOnTop] = useState(isDefaultTop);

  const toggleAlwaysOnTop = () => {
    setAlwaysOnTop(!alwaysOnTop);
    setTop(!alwaysOnTop);
  };

  const toggleTheme = () => {
    onDarkModeChange(!isDark);
  };

  return (
    <FullScreenLoading windowType={windowType} skipLoading={skipLoading}>
      <div className={classnames(styles.defaultLayout, "bg-white dark:bg-[#1a1a1a]")}>
        {showTitlebar && (
          <GlobalTitlebar title={title}>
            <TitlebarIcon tip={isDark ? "浅色" : "深色"} placement="bottom" onClick={toggleTheme}>
              {isDark ? <SunOutlined /> : <MoonOutlined />}
            </TitlebarIcon>
            <TitlebarIcon
              tip={alwaysOnTop ? "取消置顶" : "置顶"}
              placement="left"
              onClick={toggleAlwaysOnTop}
            >
              <PushpinOutlined
                className={classnames(styles.pin, {
                  [styles.onTop]: alwaysOnTop,
                })}
              />
            </TitlebarIcon>
          </GlobalTitlebar>
        )}
        <div className={styles.content}>
          <Outlet />
        </div>
        {/* 去 antd 后共享组件的 toast 反馈宿主（useFlashcardGeneration/协作控制等） */}
        <ToastHost />
      </div>
    </FullScreenLoading>
  );
};

export default QuickOpenLayout;
