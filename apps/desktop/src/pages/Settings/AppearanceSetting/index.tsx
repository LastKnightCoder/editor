import { useMemoizedFn, useAsyncEffect } from "ahooks";
import { produce } from "immer";
import { useState } from "react";
import type { ImageBorderRadiusPreset, ImageShadowPreset } from "@tau/editor";
import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import { getAllFonts } from "@/commands";
import {
  MERMAID_THEME_NAMES,
  type MermaidRenderStyle,
  type MermaidThemeName,
} from "@tau/shared";
import {
  SettingContainer,
  SettingSection,
  SettingInput,
  SettingDropdown,
  SettingFontPicker,
  SettingSwitch,
} from "../components";

export type BackgroundType =
  | "solid"
  | "gradient1"
  | "gradient2"
  | "gradient3"
  | "gradient4"
  | "gradient5"
  | "gradient6"
  | "gradient7"
  | "gradient8"
  | "gradient9";

interface BackgroundOption {
  key: BackgroundType;
  label: string;
  description: string;
}

const backgroundOptions: BackgroundOption[] = [
  { key: "solid", label: "纯色", description: "默认纯色背景" },
  { key: "gradient1", label: "紫色晕染", description: "柔和紫调扩散" },
  { key: "gradient2", label: "蓝色晕染", description: "静谧蓝调旋转" },
  { key: "gradient3", label: "暖色晕染", description: "温暖橙调流动" },
  { key: "gradient4", label: "绿色晕染", description: "清新绿调扩散" },
  { key: "gradient5", label: "粉色晕染", description: "淡雅粉调流动" },
  { key: "gradient6", label: "灰色晕染", description: "中性灰调旋转" },
  { key: "gradient7", label: "青蓝晕染", description: "清澈青调流动" },
  { key: "gradient8", label: "金色晕染", description: "璀璨金调扩散" },
  { key: "gradient9", label: "红色晕染", description: "热情红调流动" },
];

const imageBorderRadiusOptions: Array<{
  label: string;
  value: ImageBorderRadiusPreset;
}> = [
  { label: "无圆角", value: "none" },
  { label: "小圆角", value: "sm" },
  { label: "中圆角", value: "md" },
  { label: "大圆角", value: "lg" },
];

const imageShadowOptions: Array<{
  label: string;
  value: ImageShadowPreset;
}> = [
  { label: "无阴影", value: "none" },
  { label: "小阴影", value: "sm" },
  { label: "中阴影", value: "md" },
  { label: "大阴影", value: "lg" },
];

const AppearanceSetting = () => {
  const {
    setting,
    onFontSettingChange,
    setMermaidStyle,
    setMermaidLightTheme,
    setMermaidDarkTheme,
    setUseBeautifulMermaid,
  } = useSettingStore((state) => ({
    setting: state.setting,
    onFontSettingChange: state.onFontSettingChange,
    setMermaidStyle: state.setMermaidStyle,
    setMermaidLightTheme: state.setMermaidLightTheme,
    setMermaidDarkTheme: state.setMermaidDarkTheme,
    setUseBeautifulMermaid: state.setUseBeautifulMermaid,
  }));

  const [fonts, setFonts] = useState<string[]>([]);
  const themeColors = useThemeColors();

  const currentBackground = setting.appearance?.backgroundType || "solid";
  const imageAppearanceSetting = setting.appearance?.image || {
    borderRadius: "none" as ImageBorderRadiusPreset,
    shadow: "none" as ImageShadowPreset,
  };
  const normalizedImageShadow =
    imageAppearanceSetting.shadow === true
      ? "md"
      : imageAppearanceSetting.shadow === false ||
          !imageAppearanceSetting.shadow
        ? "none"
        : imageAppearanceSetting.shadow;
  const fontSetting = setting.fontSetting;
  const mermaidSetting = setting.misc.mermaid || {
    style: "svg",
    lightTheme: "github-light",
    darkTheme: "github-dark",
    useBeautifulMermaid: true,
  };

  const mermaidStyleOptions: Array<{
    label: string;
    value: MermaidRenderStyle;
  }> = [
    { label: "SVG（图形渲染）", value: "svg" },
    { label: "ASCII（Unicode 字符）", value: "ascii-unicode" },
  ];

  const mermaidThemeOptions: Array<{ label: string; value: MermaidThemeName }> =
    MERMAID_THEME_NAMES.map((themeName) => ({
      label: themeName,
      value: themeName,
    }));

  useAsyncEffect(async () => {
    const fonts = await getAllFonts();
    const filterFonts = fonts
      .filter(
        (font) =>
          !(
            font.toLowerCase().includes("light") ||
            font.toLowerCase().includes("bold") ||
            font.toLowerCase().includes("semi")
          ) ||
          font.toLowerCase().includes("thin") ||
          font.toLowerCase().includes("medium"),
      )
      .map((font) => font.replace(/[R|r]egular/g, "").trim())
      .filter(Boolean);
    const dedupedFonts = Array.from(new Set(filterFonts));
    setFonts(dedupedFonts);
  }, []);

  const handleBackgroundSelect = useMemoizedFn((option: BackgroundOption) => {
    const newSetting = produce(setting, (draft) => {
      if (!draft.appearance) {
        draft.appearance = { backgroundType: "solid" };
      }
      draft.appearance.backgroundType = option.key;
    });
    useSettingStore.setState({ setting: newSetting });
  });

  const onChineseFontChange = (font: string) => {
    onFontSettingChange(
      produce(fontSetting, (draft) => {
        draft.chineseFont = font;
      }),
    );
  };

  const onEnglishFontChange = (font: string) => {
    onFontSettingChange(
      produce(fontSetting, (draft) => {
        draft.englishFont = font;
      }),
    );
  };

  const onFontSizeChange = (size: number) => {
    onFontSettingChange(
      produce(fontSetting, (draft) => {
        draft.fontSize = size;
      }),
    );
  };

  const onCodeFontChange = (font: string) => {
    onFontSettingChange(
      produce(fontSetting, (draft) => {
        draft.codeFont = font;
      }),
    );
  };

  const handleThemeModeChange = useMemoizedFn((isDark: boolean) => {
    const newSetting = produce(setting, (draft) => {
      draft.darkMode = isDark;
    });
    useSettingStore.setState({ setting: newSetting });
  });

  const handleAnimationToggle = useMemoizedFn((enabled: boolean) => {
    const newSetting = produce(setting, (draft) => {
      if (!draft.appearance) {
        draft.appearance = { backgroundType: "solid" };
      }
      draft.appearance.backgroundAnimation = enabled;
    });
    useSettingStore.setState({ setting: newSetting });
  });

  const isAnimationEnabled = setting.appearance?.backgroundAnimation ?? false;

  const handleImageBorderRadiusChange = useMemoizedFn((value: string) => {
    const newSetting = produce(setting, (draft) => {
      if (!draft.appearance) {
        draft.appearance = { backgroundType: "solid" };
      }
      if (!draft.appearance.image) {
        draft.appearance.image = {
          borderRadius: "none",
          shadow: false,
        };
      }
      draft.appearance.image.borderRadius = value as ImageBorderRadiusPreset;
    });
    useSettingStore.setState({ setting: newSetting });
  });

  const handleImageShadowChange = useMemoizedFn((value: string) => {
    const newSetting = produce(setting, (draft) => {
      if (!draft.appearance) {
        draft.appearance = { backgroundType: "solid" };
      }
      if (!draft.appearance.image) {
        draft.appearance.image = {
          borderRadius: "none",
          shadow: "none",
        };
      }
      draft.appearance.image.shadow = value as ImageShadowPreset;
    });
    useSettingStore.setState({ setting: newSetting });
  });

  const handleMermaidStyleChange = useMemoizedFn((style: string) => {
    setMermaidStyle(style as MermaidRenderStyle);
  });

  const handleMermaidLightThemeChange = useMemoizedFn((theme: string) => {
    setMermaidLightTheme(theme as MermaidThemeName);
  });

  const handleMermaidDarkThemeChange = useMemoizedFn((theme: string) => {
    setMermaidDarkTheme(theme as MermaidThemeName);
  });

  return (
    <SettingContainer>
      {/* 主题模式设置 */}
      <SettingSection title="主题模式" description="选择应用的亮色或暗色主题">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl">
          {/* 浅色主题 */}
          <div
            onClick={() => handleThemeModeChange(false)}
            className={`
              relative overflow-hidden rounded-xl cursor-pointer
              transition-all duration-300 ease-in-out
              shadow-sm
              border-2
              ${
                !setting.darkMode
                  ? `${themeColors.cardBorderClass}`
                  : "border-gray-200 dark:border-gray-700"
              }
            `}
          >
            {!setting.darkMode && (
              <div
                className={`absolute top-0 left-0 right-0 h-1 ${themeColors.gradientClass}`}
              />
            )}
            {/* 浅色主题预览 */}
            <div className="h-32 bg-linear-to-br from-gray-50 via-white to-gray-100 relative overflow-hidden">
              {/* 模拟浅色界面元素 */}
              <div className="absolute inset-0 flex flex-col gap-2 p-4">
                <div className="h-3 w-3/4 bg-zinc-800 rounded" />
                <div className="h-2 w-1/2 bg-gray-400 rounded" />
                <div className="mt-auto h-8 bg-white border border-gray-200 rounded-lg shadow-sm" />
              </div>
            </div>

            {/* 信息区域 */}
            <div className="p-4 bg-gray-50 dark:bg-zinc-800/50">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
                浅色主题
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                明亮清晰的界面风格
              </p>
            </div>

            {/* 选中状态标识 */}
            {!setting.darkMode && (
              <div
                className={`absolute top-3 right-3 w-6 h-6 rounded-full ${themeColors.badgeBgClass} flex items-center justify-center`}
              >
                <svg
                  className={`w-4 h-4 ${themeColors.badgeTextClass}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* 深色主题 */}
          <div
            onClick={() => handleThemeModeChange(true)}
            className={`
              relative overflow-hidden rounded-xl cursor-pointer
              transition-all duration-300 ease-in-out
              shadow-sm
              border-2
              ${
                setting.darkMode
                  ? `${themeColors.cardBorderClass}`
                  : "border-gray-200 dark:border-gray-700"
              }
            `}
          >
            {setting.darkMode && (
              <div
                className={`absolute top-0 left-0 right-0 h-1 ${themeColors.gradientClass}`}
              />
            )}
            {/* 深色主题预览 */}
            <div className="h-32 bg-linear-to-br from-gray-900 via-gray-800 to-gray-900 relative overflow-hidden">
              {/* 模拟深色界面元素 */}
              <div className="absolute inset-0 flex flex-col gap-2 p-4">
                <div className="h-3 w-3/4 bg-gray-100 rounded" />
                <div className="h-2 w-1/2 bg-gray-400 rounded" />
                <div className="mt-auto h-8 bg-zinc-800 border border-gray-700 rounded-lg shadow-sm" />
              </div>
            </div>

            {/* 信息区域 */}
            <div className="p-4 bg-gray-50 dark:bg-zinc-800/50">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
                深色主题
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                柔和护眼的暗色风格
              </p>
            </div>

            {/* 选中状态标识 */}
            {setting.darkMode && (
              <div
                className={`absolute top-3 right-3 w-6 h-6 rounded-full ${themeColors.badgeBgClass} flex items-center justify-center`}
              >
                <svg
                  className={`w-4 h-4 ${themeColors.badgeTextClass}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            )}
          </div>
        </div>
      </SettingSection>

      {/* 背景动画设置 */}
      <SettingSection
        title="背景动画"
        description="控制渐变背景是否播放动画效果"
      >
        <SettingSwitch
          label="启用背景动画"
          description="开启后，渐变背景会缓慢流动变化"
          checked={isAnimationEnabled}
          onChange={handleAnimationToggle}
        />
      </SettingSection>

      {/* 背景设置 */}
      <SettingSection
        title="背景样式"
        description="选择设置页面的背景样式，渐变背景会让主体内容呈现磨砂质感"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {backgroundOptions.map((option) => {
            const isActive = currentBackground === option.key;
            return (
              <div
                key={option.key}
                onClick={() => handleBackgroundSelect(option)}
                className={`
                  relative overflow-hidden rounded-xl cursor-pointer
                  transition-all duration-300 ease-in-out
                  shadow-sm
                  border-2
                  ${
                    isActive
                      ? `${themeColors.cardBorderClass}`
                      : "border-gray-200 dark:border-gray-700"
                  }
                `}
              >
                {isActive && (
                  <div
                    className={`absolute top-0 left-0 right-0 h-1 ${themeColors.gradientClass}`}
                  />
                )}
                <div
                  className={`
                    h-32 relative overflow-hidden
                    ${option.key === "solid" ? "bg-white dark:bg-zinc-900" : ""}
                  `}
                >
                  {option.key === "gradient1" && (
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#f3f0ff_0%,#faf5ff_40%,#ffffff_100%)] dark:bg-[radial-gradient(ellipse_at_top_left,#2d1f3d_0%,#1f1530_50%,#15101f_100%)] animate-gradient-shift bg-size-[400%_400%]" />
                  )}
                  {option.key === "gradient2" && (
                    <div className="absolute inset-0 bg-[conic-gradient(from_45deg_at_50%_50%,#e8f4f8_0deg,#f0f9ff_90deg,#e8f4f8_180deg,#d4ebf7_270deg,#e8f4f8_360deg)] dark:bg-[conic-gradient(from_45deg_at_50%_50%,#1a2535_0deg,#152030_90deg,#1a2838_180deg,#0f1a28_270deg,#1a2535_360deg)] animate-gradient-flow bg-size-[400%_400%]" />
                  )}
                  {option.key === "gradient3" && (
                    <div className="absolute inset-0 bg-linear-to-br from-[#fff5eb] via-[#fffbf0] to-[#fff8f0] dark:from-[#2d1f0f] dark:via-[#251a0a] dark:to-[#1f1505] animate-gradient-dream bg-size-[400%_400%]" />
                  )}
                  {option.key === "gradient4" && (
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,#f0fff4_0%,#f0fdf4_40%,#ffffff_100%)] dark:bg-[radial-gradient(ellipse_at_bottom_right,#1a2d1f_0%,#152318_50%,#0f1a12_100%)] animate-gradient-shift bg-size-[400%_400%]" />
                  )}
                  {option.key === "gradient5" && (
                    <div className="absolute inset-0 bg-linear-to-br from-[#fef5f8] via-[#fff0f5] to-[#fffbf5] dark:from-[#2d1a25] dark:via-[#221520] dark:to-[#1a0f15] animate-gradient-dream bg-size-[400%_400%]" />
                  )}
                  {option.key === "gradient6" && (
                    <div className="absolute inset-0 bg-[conic-gradient(from_45deg_at_50%_50%,#f5f5f5_0deg,#fafafa_90deg,#f5f5f5_180deg,#eeeeee_270deg,#f5f5f5_360deg)] dark:bg-[conic-gradient(from_45deg_at_50%_50%,#22222a_0deg,#1a1a22_90deg,#1f1f28_180deg,#151518_270deg,#22222a_360deg)] animate-gradient-flow bg-size-[400%_400%]" />
                  )}
                  {option.key === "gradient7" && (
                    <div className="absolute inset-0 bg-linear-to-br from-[#e0f7fa] via-[#e0f2f1] to-[#e8f5e9] dark:from-[#0d2830] dark:via-[#0f2528] dark:to-[#0f2620] animate-gradient-dream bg-size-[400%_400%]" />
                  )}
                  {option.key === "gradient8" && (
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,#fffde7_0%,#fff8e1_40%,#ffffff_100%)] dark:bg-[radial-gradient(ellipse_at_top_right,#2d2810_0%,#252010_50%,#1f1a0a_100%)] animate-gradient-shift bg-size-[400%_400%]" />
                  )}
                  {option.key === "gradient9" && (
                    <div className="absolute inset-0 bg-linear-to-br from-[#ffebee] via-[#fce4ec] to-[#fff0f0] dark:from-[#2d1518] dark:via-[#251218] dark:to-[#1f0f12] animate-gradient-dream bg-size-[400%_400%]" />
                  )}

                  {/* 磨砂卡片示例 */}
                  {option.key !== "solid" && (
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                      <div className="w-full h-10 rounded-lg bg-white/50 dark:bg-[#0a0a0a]/40 backdrop-blur-xl backdrop-saturate-150 border border-white/20 dark:border-white/10 shadow-lg" />
                    </div>
                  )}
                </div>

                {/* 信息区域 */}
                <div className="p-4 bg-gray-50 dark:bg-zinc-800/50">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    {option.label}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {option.description}
                  </p>
                </div>

                {/* 选中状态标识 */}
                {isActive && (
                  <div
                    className={`absolute top-3 right-3 w-6 h-6 rounded-full ${themeColors.badgeBgClass} flex items-center justify-center`}
                  >
                    <svg
                      className={`w-4 h-4 ${themeColors.badgeTextClass}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SettingSection>

      <SettingSection
        title="Mermaid 渲染"
        description="默认使用 beautiful-mermaid 提供 SVG 与 ASCII（Unicode）渲染。关闭后，所有 Mermaid 图表统一回退为 Mermaid 原生 SVG 渲染。"
      >
        <SettingSwitch
          checked={mermaidSetting.useBeautifulMermaid ?? true}
          onChange={setUseBeautifulMermaid}
          label="启用 beautiful-mermaid"
          description="关闭后不再使用 beautiful-mermaid，ASCII 渲染和自定义 Mermaid 主题也会一并停用。"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <SettingDropdown
            label="渲染风格"
            value={mermaidSetting.style}
            onChange={handleMermaidStyleChange}
            options={mermaidStyleOptions}
            placeholder="选择 Mermaid 渲染风格"
            disabled={!mermaidSetting.useBeautifulMermaid}
          />
          <SettingDropdown
            label="浅色主题"
            value={mermaidSetting.lightTheme}
            onChange={handleMermaidLightThemeChange}
            options={mermaidThemeOptions}
            placeholder="选择浅色主题"
            disabled={!mermaidSetting.useBeautifulMermaid}
          />
          <SettingDropdown
            label="深色主题"
            value={mermaidSetting.darkTheme}
            onChange={handleMermaidDarkThemeChange}
            options={mermaidThemeOptions}
            placeholder="选择深色主题"
            disabled={!mermaidSetting.useBeautifulMermaid}
          />
        </div>
      </SettingSection>

      <SettingSection
        title="图片外观"
        description="设置单图与图库在未单独指定时使用的默认外观"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SettingDropdown
            label="默认圆角"
            value={imageAppearanceSetting.borderRadius || "none"}
            onChange={handleImageBorderRadiusChange}
            options={imageBorderRadiusOptions}
            placeholder="选择默认圆角"
          />
          <div className="flex items-end">
            <div className="w-full">
              <SettingDropdown
                label="默认阴影"
                value={normalizedImageShadow}
                onChange={handleImageShadowChange}
                options={imageShadowOptions}
                placeholder="选择默认阴影"
              />
            </div>
          </div>
        </div>
      </SettingSection>

      {/* 字体设置 */}
      <SettingSection title="正文字体" description="设置编辑器中正文的字体样式">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <SettingFontPicker
            label="中文字体"
            value={fontSetting.chineseFont}
            onChange={onChineseFontChange}
            options={fonts}
            kind="chinese"
            placeholder="搜索中文字体..."
          />
          <SettingFontPicker
            label="英文字体"
            value={fontSetting.englishFont}
            onChange={onEnglishFontChange}
            options={fonts}
            kind="english"
            placeholder="搜索字体名称..."
          />
          <SettingInput
            label="字体大小"
            type="number"
            min={12}
            value={fontSetting.fontSize}
            onChange={(e) => onFontSizeChange(Number(e.target.value))}
            placeholder="字体大小"
          />
        </div>
      </SettingSection>

      {/* 代码字体 */}
      <SettingSection title="代码字体" description="设置代码块中的字体样式">
        <div className="max-w-md">
          <SettingFontPicker
            label="代码字体"
            value={fontSetting.codeFont}
            onChange={onCodeFontChange}
            options={fonts}
            kind="code"
            placeholder="搜索代码字体..."
          />
        </div>
      </SettingSection>
    </SettingContainer>
  );
};

export default AppearanceSetting;
