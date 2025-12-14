import { Outlet, useSearchParams, useLocation } from "react-router-dom";

import styles from "./index.module.less";
import { PushpinOutlined, SunOutlined, MoonOutlined } from "@ant-design/icons";
import TitlebarIcon from "@/components/TitlebarIcon";
import { useState } from "react";
import classnames from "classnames";
import { setAlwaysOnTop as setTop } from "@/commands";
import { platform } from "@/electron";
import useSettingStore from "@/stores/useSettingStore";
import FullScreenLoading from "@/components/FullScreenLoading";

interface QuickOpenLayoutProps {
  title?: string;
}

/**
 * 根据路由路径推断窗口类型
 */
function getWindowTypeFromPath(pathname: string): string {
  if (pathname.includes("single-card-editor")) return "card";
  if (pathname.includes("single-article-editor")) return "article";
  if (pathname.includes("single-project-item-editor")) return "project-item";
  if (pathname.includes("single-document-item-editor")) return "document-item";
  if (pathname.includes("single-markdown-editor")) return "markdown";
  if (pathname.includes("todo")) return "todo";
  if (pathname.includes("goals")) return "goal";
  if (pathname.includes("questions")) return "question";
  if (pathname.includes("pomodoro/mini")) return "pomodoro-mini";
  if (pathname.includes("pomodoro/immersive")) return "pomodoro-immersive";
  if (pathname.includes("pomodoro")) return "pomodoro";
  if (pathname.includes("quick-card")) return "quick-card";
  return "card"; // 默认类型
}

const QuickOpenLayout = ({ title }: QuickOpenLayoutProps) => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const isMac = platform === "darwin";
  const showTitlebar = isMac || searchParams.get("showTitlebar") === "true";
  const isDefaultTop = searchParams.get("isDefaultTop") === "true";

  // 推断窗口类型
  const windowType = getWindowTypeFromPath(location.pathname);
  // Markdown 编辑器跳过加载等待
  const skipLoading = windowType === "markdown";

  const { isDark, onDarkModeChange } = useSettingStore((state) => ({
    isDark: state.setting.darkMode,
    onDarkModeChange: state.onDarkModeChange,
  }));

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
      <div className={styles.defaultLayout}>
        {showTitlebar && (
          <div className={styles.titlebar}>
            {title && <div className={classnames(styles.title)}>{title}</div>}
            <div className={styles.icons}>
              <TitlebarIcon tip={isDark ? "浅色" : "深色"} onClick={toggleTheme}>
                {isDark ? <SunOutlined /> : <MoonOutlined />}
              </TitlebarIcon>
              <TitlebarIcon
                tip={alwaysOnTop ? "取消置顶" : "置顶"}
                onClick={toggleAlwaysOnTop}
              >
                <PushpinOutlined
                  className={classnames(styles.pin, {
                    [styles.onTop]: alwaysOnTop,
                  })}
                />
              </TitlebarIcon>
            </div>
          </div>
        )}
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </FullScreenLoading>
  );
};

export default QuickOpenLayout;
