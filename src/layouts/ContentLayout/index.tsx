import { useEffect, memo } from "react";
import isHotkey from "is-hotkey";
import PanesLayout from "./components/PanesLayout";

import Search from "./components/Search";
import CommandPanel from "@/components/CommandPanel";

import useInitDatabase from "@/hooks/useInitDatabase.ts";
import useBackgroundMode from "@/hooks/useBackgroundMode";

import { openMarkdownInNewWindow, selectFile } from "@/commands";

import styles from "./index.module.less";
import SettingModal from "./components/SettingModal";
import GlobalTitlebar from "./components/GlobalTitlebar";

const ShortSidebarLayout = memo(() => {
  useInitDatabase();

  const { backgroundType, isGradient } = useBackgroundMode();

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

  // 渐变背景类名映射 - 提升深色模式饱和度和亮度
  const gradientClass = {
    solid: "bg-[var(--primary-bg-color)]",
    // 渐变1: 柔和紫调径向扩散
    gradient1:
      "bg-[radial-gradient(ellipse_at_top_left,#f3f0ff_0%,#faf5ff_40%,#ffffff_100%)] dark:bg-[radial-gradient(ellipse_at_top_left,#2d1f3d_0%,#1f1530_50%,#15101f_100%)] animate-gradient-shift bg-[length:400%_400%]",
    // 渐变2: 静谧蓝调圆形旋转
    gradient2:
      "bg-[conic-gradient(from_45deg_at_50%_50%,#e8f4f8_0deg,#f0f9ff_90deg,#e8f4f8_180deg,#d4ebf7_270deg,#e8f4f8_360deg)] dark:bg-[conic-gradient(from_45deg_at_50%_50%,#1a2535_0deg,#152030_90deg,#1a2838_180deg,#0f1a28_270deg,#1a2535_360deg)] animate-gradient-flow bg-[length:400%_400%]",
    // 渐变3: 温暖橙调流动
    gradient3:
      "bg-gradient-to-br from-[#fff5eb] via-[#fffbf0] to-[#fff8f0] dark:from-[#2d1f0f] dark:via-[#251a0a] dark:to-[#1f1505] animate-gradient-dream bg-[length:400%_400%]",
    // 渐变4: 清新绿调径向扩散
    gradient4:
      "bg-[radial-gradient(ellipse_at_bottom_right,#f0fff4_0%,#f0fdf4_40%,#ffffff_100%)] dark:bg-[radial-gradient(ellipse_at_bottom_right,#1a2d1f_0%,#152318_50%,#0f1a12_100%)] animate-gradient-shift bg-[length:400%_400%]",
    // 渐变5: 淡雅粉调流动
    gradient5:
      "bg-gradient-to-br from-[#fef5f8] via-[#fff0f5] to-[#fffbf5] dark:from-[#2d1a25] dark:via-[#221520] dark:to-[#1a0f15] animate-gradient-dream bg-[length:400%_400%]",
    // 渐变6: 中性灰调圆形旋转
    gradient6:
      "bg-[conic-gradient(from_45deg_at_50%_50%,#f5f5f5_0deg,#fafafa_90deg,#f5f5f5_180deg,#eeeeee_270deg,#f5f5f5_360deg)] dark:bg-[conic-gradient(from_45deg_at_50%_50%,#22222a_0deg,#1a1a22_90deg,#1f1f28_180deg,#151518_270deg,#22222a_360deg)] animate-gradient-flow bg-[length:400%_400%]",
    // 渐变7: 清澈青蓝调流动
    gradient7:
      "bg-gradient-to-br from-[#e0f7fa] via-[#e0f2f1] to-[#e8f5e9] dark:from-[#0d2830] dark:via-[#0f2528] dark:to-[#0f2620] animate-gradient-dream bg-[length:400%_400%]",
    // 渐变8: 璀璨金色径向扩散
    gradient8:
      "bg-[radial-gradient(ellipse_at_top_right,#fffde7_0%,#fff8e1_40%,#ffffff_100%)] dark:bg-[radial-gradient(ellipse_at_top_right,#2d2810_0%,#252010_50%,#1f1a0a_100%)] animate-gradient-shift bg-[length:400%_400%]",
    // 渐变9: 热情红色流动
    gradient9:
      "bg-gradient-to-br from-[#ffebee] via-[#fce4ec] to-[#fff0f0] dark:from-[#2d1518] dark:via-[#251218] dark:to-[#1f0f12] animate-gradient-dream bg-[length:400%_400%]",
  }[backgroundType];

  return (
    <div
      className={`w-screen h-screen flex flex-col ${styles.container} ${gradientClass}`}
    >
      <GlobalTitlebar />

      <div className="flex-1 min-h-0 flex">
        <div className={`flex-1 min-w-0 h-full box-border flex flex-col`}>
          <div
            className={`flex-1 min-h-0 mt-3 mx-3 mb-3 shadow-lg flex overflow-hidden rounded-2xl border ${
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
      </div>

      <Search />
      <SettingModal />
      <CommandPanel />
    </div>
  );
});

export default ShortSidebarLayout;
