import { useMemoizedFn, useAsyncEffect } from "ahooks";
import { produce } from "immer";
import { useState } from "react";
import type { ImageBorderRadiusPreset, ImageShadowPreset } from "@tau/editor";
import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import {
  ACCENT_PRESETS,
  ACCENT_LABELS,
  ACCENT_COLORS,
  DEFAULT_ACCENT,
  type AccentPreset,
} from "@/constants/accent";
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

  const isDarkMode = setting.darkMode;
  const currentAccent = setting.appearance?.accent ?? DEFAULT_ACCENT;
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

  const updateAppearance = useMemoizedFn(
    (updater: (appearance: NonNullable<typeof setting.appearance>) => void) => {
      const newSetting = produce(setting, (draft) => {
        if (!draft.appearance) {
          draft.appearance = { accent: DEFAULT_ACCENT };
        }
        updater(draft.appearance);
      });
      useSettingStore.setState({ setting: newSetting });
    },
  );

  const handleAccentSelect = useMemoizedFn((accent: AccentPreset) => {
    updateAppearance((appearance) => {
      appearance.accent = accent;
    });
  });

  const handleThemeModeChange = useMemoizedFn((isDark: boolean) => {
    const newSetting = produce(setting, (draft) => {
      draft.darkMode = isDark;
    });
    useSettingStore.setState({ setting: newSetting });
  });

  const handleImageBorderRadiusChange = useMemoizedFn((value: string) => {
    updateAppearance((appearance) => {
      if (!appearance.image) {
        appearance.image = { borderRadius: "none", shadow: false };
      }
      appearance.image.borderRadius = value as ImageBorderRadiusPreset;
    });
  });

  const handleImageShadowChange = useMemoizedFn((value: string) => {
    updateAppearance((appearance) => {
      if (!appearance.image) {
        appearance.image = { borderRadius: "none", shadow: "none" };
      }
      appearance.image.shadow = value as ImageShadowPreset;
    });
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

  const handleMermaidStyleChange = useMemoizedFn((style: string) => {
    setMermaidStyle(style as MermaidRenderStyle);
  });

  const handleMermaidLightThemeChange = useMemoizedFn((theme: string) => {
    setMermaidLightTheme(theme as MermaidThemeName);
  });

  const handleMermaidDarkThemeChange = useMemoizedFn((theme: string) => {
    setMermaidDarkTheme(theme as MermaidThemeName);
  });

  const accentSwatch = (isDark: boolean) => (accent: AccentPreset) =>
    isDark ? ACCENT_COLORS[accent][1] : ACCENT_COLORS[accent][0];

  return (
    <SettingContainer>
      {/* 主题模式设置 */}
      <SettingSection title="主题模式" description="选择应用的亮色或暗色主题">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl">
          {[false, true].map((isDark) => {
            const isActive = isDarkMode === isDark;
            return (
              <div
                key={String(isDark)}
                onClick={() => handleThemeModeChange(isDark)}
                className={`
                  relative overflow-hidden rounded-xl cursor-pointer
                  transition-all duration-300 ease-in-out
                  shadow-sm border-2
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
                  className={`h-32 relative overflow-hidden ${
                    isDark
                      ? "bg-linear-to-br from-gray-900 via-gray-800 to-gray-900"
                      : "bg-linear-to-br from-gray-50 via-white to-gray-100"
                  }`}
                >
                  <div className="absolute inset-0 flex flex-col gap-2 p-4">
                    <div
                      className={`h-3 w-3/4 rounded ${isDark ? "bg-gray-100" : "bg-zinc-800"}`}
                    />
                    <div className="h-2 w-1/2 bg-gray-400 rounded" />
                    <div
                      className={`mt-auto h-8 rounded-lg shadow-sm ${
                        isDark
                          ? "bg-zinc-800 border border-gray-700"
                          : "bg-white border border-gray-200"
                      }`}
                    />
                  </div>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-zinc-800/50">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    {isDark ? "深色主题" : "浅色主题"}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {isDark ? "柔和护眼的暗色风格" : "明亮清晰的界面风格"}
                  </p>
                </div>

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

      {/* 主题色设置 */}
      <SettingSection
        title="主题色"
        description="界面选中态、主按钮与焦点环使用的强调色,背景保持中性"
      >
        <div className="flex flex-wrap gap-4 max-w-2xl">
          {ACCENT_PRESETS.map((accent) => {
            const isActive = currentAccent === accent;
            const color = accentSwatch(isDarkMode)(accent);
            return (
              <button
                key={accent}
                onClick={() => handleAccentSelect(accent)}
                className="group flex flex-col items-center gap-2 cursor-pointer"
                title={ACCENT_LABELS[accent]}
              >
                <span
                  className={`
                    w-10 h-10 rounded-full transition-all duration-200
                    ${isActive ? "ring-2 ring-offset-2" : "group-hover:scale-110"}
                  `}
                  style={
                    {
                      backgroundColor: color,
                      ...(isActive
                        ? {
                            "--tw-ring-color": color,
                            "--tw-ring-offset-color":
                              "var(--th-bg-elevated, #fff)",
                          }
                        : {}),
                    } as React.CSSProperties
                  }
                />
                <span
                  className={`text-xs ${isActive ? themeColors.activeTextClass : themeColors.secondaryTextClass}`}
                >
                  {ACCENT_LABELS[accent]}
                </span>
              </button>
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
