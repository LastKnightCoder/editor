import { useEffect, memo } from "react";
import isHotkey from "is-hotkey";
import PanesLayout from "./components/PanesLayout";
import RightChatSidebar from "./components/RightChatSidebar";

import Search from "./components/Search";
import CommandPanel from "@/components/CommandPanel";

import useInitDatabase from "@/hooks/useInitDatabase.ts";
import useBackgroundMode from "@/hooks/useBackgroundMode";

import { openMarkdownInNewWindow, selectFile } from "@/commands";

import styles from "./index.module.less";
import SettingModal from "./components/SettingModal";
import GlobalTitlebar from "./components/GlobalTitlebar";
import FullScreenLoading from "@/components/FullScreenLoading";
import { initAiServer } from "@/services/aiServer";

const ShortSidebarLayout = memo(() => {
  useInitDatabase();

  const { backgroundType, isGradient, isAnimationEnabled } =
    useBackgroundMode();

  useEffect(() => {
    initAiServer();
  }, []);

  useEffect(() => {
    const handleOpenMarkdown = async (e: any) => {
      if (isHotkey("mod+o", e)) {
        e.preventDefault();
        e.stopPropagation();
        const filePaths = await selectFile({
          properties: ["openFile"],
          filters: [{ name: "Markdown", extensions: ["md"] }],
        });
        if (!filePaths) return;
        await openMarkdownInNewWindow(filePaths[0]);
      }
    };
    window.addEventListener("keydown", handleOpenMarkdown);
    return () => {
      window.removeEventListener("keydown", handleOpenMarkdown);
    };
  }, []);

  // 静态渐变背景类名映射（无动画）
  const staticGradientClass = {
    solid: "bg-[var(--primary-bg-color)]",
    gradient1:
      "bg-[radial-gradient(ellipse_at_top_left,#f3f0ff_0%,#faf5ff_40%,#ffffff_100%)] dark:bg-[radial-gradient(ellipse_at_top_left,#2d1f3d_0%,#1f1530_50%,#15101f_100%)]",
    gradient2:
      "bg-[conic-gradient(from_45deg_at_50%_50%,#e8f4f8_0deg,#f0f9ff_90deg,#e8f4f8_180deg,#d4ebf7_270deg,#e8f4f8_360deg)] dark:bg-[conic-gradient(from_45deg_at_50%_50%,#1a2535_0deg,#152030_90deg,#1a2838_180deg,#0f1a28_270deg,#1a2535_360deg)]",
    gradient3:
      "bg-gradient-to-br from-[#fff5eb] via-[#fffbf0] to-[#fff8f0] dark:from-[#2d1f0f] dark:via-[#251a0a] dark:to-[#1f1505]",
    gradient4:
      "bg-[radial-gradient(ellipse_at_bottom_right,#f0fff4_0%,#f0fdf4_40%,#ffffff_100%)] dark:bg-[radial-gradient(ellipse_at_bottom_right,#1a2d1f_0%,#152318_50%,#0f1a12_100%)]",
    gradient5:
      "bg-gradient-to-br from-[#fef5f8] via-[#fff0f5] to-[#fffbf5] dark:from-[#2d1a25] dark:via-[#221520] dark:to-[#1a0f15]",
    gradient6:
      "bg-[conic-gradient(from_45deg_at_50%_50%,#f5f5f5_0deg,#fafafa_90deg,#f5f5f5_180deg,#eeeeee_270deg,#f5f5f5_360deg)] dark:bg-[conic-gradient(from_45deg_at_50%_50%,#22222a_0deg,#1a1a22_90deg,#1f1f28_180deg,#151518_270deg,#22222a_360deg)]",
    gradient7:
      "bg-gradient-to-br from-[#e0f7fa] via-[#e0f2f1] to-[#e8f5e9] dark:from-[#0d2830] dark:via-[#0f2528] dark:to-[#0f2620]",
    gradient8:
      "bg-[radial-gradient(ellipse_at_top_right,#fffde7_0%,#fff8e1_40%,#ffffff_100%)] dark:bg-[radial-gradient(ellipse_at_top_right,#2d2810_0%,#252010_50%,#1f1a0a_100%)]",
    gradient9:
      "bg-gradient-to-br from-[#ffebee] via-[#fce4ec] to-[#fff0f0] dark:from-[#2d1518] dark:via-[#251218] dark:to-[#1f0f12]",
  }[backgroundType];

  // 动画类名映射
  const animationClass = {
    solid: "",
    gradient1: "animate-gradient-shift bg-[length:400%_400%]",
    gradient2: "animate-gradient-flow bg-[length:400%_400%]",
    gradient3: "animate-gradient-dream bg-[length:400%_400%]",
    gradient4: "animate-gradient-shift bg-[length:400%_400%]",
    gradient5: "animate-gradient-dream bg-[length:400%_400%]",
    gradient6: "animate-gradient-flow bg-[length:400%_400%]",
    gradient7: "animate-gradient-dream bg-[length:400%_400%]",
    gradient8: "animate-gradient-shift bg-[length:400%_400%]",
    gradient9: "animate-gradient-dream bg-[length:400%_400%]",
  }[backgroundType];

  // 根据动画开关决定最终类名
  const gradientClass = isAnimationEnabled
    ? `${staticGradientClass} ${animationClass}`
    : staticGradientClass;

  return (
    <FullScreenLoading windowType="main">
      <div
        className={`w-screen h-screen flex flex-col ${styles.container} ${gradientClass}`}
      >
        <GlobalTitlebar />

        <div className="flex-1 min-h-0 flex gap-3 px-3 pb-3 pt-3 overflow-hidden">
          <div className={`flex-1 min-w-0 h-full box-border flex flex-col`}>
            <div
              className={`flex-1 min-h-0 shadow-lg flex overflow-hidden rounded-2xl border ${
                isGradient
                  ? "bg-white/20 dark:bg-[#0a0a0a]/15 backdrop-blur-sm backdrop-saturate-110 border-white/30 dark:border-white/20"
                  : "bg-(--main-bg-color) border-(--line-color)"
              }`}
            >
              <div className={styles.mainContent}>
                <PanesLayout />
              </div>
            </div>
          </div>
          <RightChatSidebar isGradient={isGradient} />
        </div>

        <Search />
        <SettingModal />
        <CommandPanel />
      </div>
    </FullScreenLoading>
  );
});

export default ShortSidebarLayout;
