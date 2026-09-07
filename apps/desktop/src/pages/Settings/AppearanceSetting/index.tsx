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
  SettingContainer,
  SettingSection,
  SettingInput,
  SettingDropdown,
  SettingFontPicker,
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
  const { setting, onFontSettingChange } = useSettingStore(state => ({
    setting: state.setting,
    onFontSettingChange: state.onFontSettingChange,
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
      : imageAppearanceSetting.shadow === false || !imageAppearanceSetting.shadow
        ? "none"
        : imageAppearanceSetting.shadow;
  const fontSetting = setting.fontSetting;

  useAsyncEffect(async () => {
    const fonts = await getAllFonts();
    const filterFonts = fonts
      .filter(
        font =>
          !(
            font.toLowerCase().includes("light") ||
            font.toLowerCase().includes("bold") ||
            font.toLowerCase().includes("semi")
          ) ||
          font.toLowerCase().includes("thin") ||
          font.toLowerCase().includes("medium")
      )
      .map(font => font.replace(/[R|r]egular/g, "").trim())
      .filter(Boolean);
    const dedupedFonts = Array.from(new Set(filterFonts));
    setFonts(dedupedFonts);
  }, []);

  const updateAppearance = useMemoizedFn(
    (updater: (appearance: NonNullable<typeof setting.appearance>) => void) => {
      const newSetting = produce(setting, draft => {
        if (!draft.appearance) {
          draft.appearance = { accent: DEFAULT_ACCENT };
        }
        updater(draft.appearance);
      });
      useSettingStore.setState({ setting: newSetting });
    }
  );

  const handleAccentSelect = useMemoizedFn((accent: AccentPreset) => {
    updateAppearance(appearance => {
      appearance.accent = accent;
    });
  });

  const handleThemeModeChange = useMemoizedFn((isDark: boolean) => {
    const newSetting = produce(setting, draft => {
      draft.darkMode = isDark;
    });
    useSettingStore.setState({ setting: newSetting });
  });

  const handleImageBorderRadiusChange = useMemoizedFn((value: string) => {
    updateAppearance(appearance => {
      if (!appearance.image) {
        appearance.image = { borderRadius: "none", shadow: false };
      }
      appearance.image.borderRadius = value as ImageBorderRadiusPreset;
    });
  });

  const handleImageShadowChange = useMemoizedFn((value: string) => {
    updateAppearance(appearance => {
      if (!appearance.image) {
        appearance.image = { borderRadius: "none", shadow: "none" };
      }
      appearance.image.shadow = value as ImageShadowPreset;
    });
  });

  const onChineseFontChange = (font: string) => {
    onFontSettingChange(
      produce(fontSetting, draft => {
        draft.chineseFont = font;
      })
    );
  };

  const onEnglishFontChange = (font: string) => {
    onFontSettingChange(
      produce(fontSetting, draft => {
        draft.englishFont = font;
      })
    );
  };

  const onFontSizeChange = (size: number) => {
    onFontSettingChange(
      produce(fontSetting, draft => {
        draft.fontSize = size;
      })
    );
  };

  const onCodeFontChange = (font: string) => {
    onFontSettingChange(
      produce(fontSetting, draft => {
        draft.codeFont = font;
      })
    );
  };

  const accentSwatch = (isDark: boolean) => (accent: AccentPreset) =>
    isDark ? ACCENT_COLORS[accent][1] : ACCENT_COLORS[accent][0];

  return (
    <SettingContainer>
      {/* 主题模式设置 */}
      <SettingSection title="主题模式" description="选择应用的亮色或暗色主题">
        <div className="grid max-w-2xl grid-cols-1 gap-5 md:grid-cols-2">
          {[false, true].map(isDark => {
            const isActive = isDarkMode === isDark;
            return (
              <div
                key={String(isDark)}
                onClick={() => handleThemeModeChange(isDark)}
                className={`relative cursor-pointer overflow-hidden rounded-xl border-2 shadow-sm transition-all duration-300 ease-in-out ${
                  isActive
                    ? `${themeColors.cardBorderClass}`
                    : "border-gray-200 dark:border-gray-700"
                } `}
              >
                {isActive && (
                  <div
                    className={`absolute left-0 right-0 top-0 h-1 ${themeColors.gradientClass}`}
                  />
                )}
                <div
                  className={`relative h-32 overflow-hidden ${
                    isDark
                      ? "bg-linear-to-br from-gray-900 via-gray-800 to-gray-900"
                      : "bg-linear-to-br from-gray-50 via-white to-gray-100"
                  }`}
                >
                  <div className="absolute inset-0 flex flex-col gap-2 p-4">
                    <div
                      className={`h-3 w-3/4 rounded ${isDark ? "bg-gray-100" : "bg-zinc-800"}`}
                    />
                    <div className="h-2 w-1/2 rounded bg-gray-400" />
                    <div
                      className={`mt-auto h-8 rounded-lg shadow-sm ${
                        isDark
                          ? "border border-gray-700 bg-zinc-800"
                          : "border border-gray-200 bg-white"
                      }`}
                    />
                  </div>
                </div>

                <div className="bg-gray-50 p-4 dark:bg-zinc-800/50">
                  <h3 className="mb-1 text-base font-semibold text-gray-900 dark:text-gray-100">
                    {isDark ? "深色主题" : "浅色主题"}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {isDark ? "柔和护眼的暗色风格" : "明亮清晰的界面风格"}
                  </p>
                </div>

                {isActive && (
                  <div
                    className={`absolute right-3 top-3 h-6 w-6 rounded-full ${themeColors.badgeBgClass} flex items-center justify-center`}
                  >
                    <svg
                      className={`h-4 w-4 ${themeColors.badgeTextClass}`}
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
        <div className="flex max-w-2xl flex-wrap gap-4">
          {ACCENT_PRESETS.map(accent => {
            const isActive = currentAccent === accent;
            const color = accentSwatch(isDarkMode)(accent);
            return (
              <button
                key={accent}
                onClick={() => handleAccentSelect(accent)}
                className="group flex cursor-pointer flex-col items-center gap-2"
                title={ACCENT_LABELS[accent]}
              >
                <span
                  className={`h-10 w-10 rounded-full transition-all duration-200 ${isActive ? "ring-2 ring-offset-2" : "group-hover:scale-110"} `}
                  style={
                    {
                      backgroundColor: color,
                      ...(isActive
                        ? {
                            "--tw-ring-color": color,
                            "--tw-ring-offset-color": "var(--th-bg-elevated, #fff)",
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

      <SettingSection title="图片外观" description="设置单图与图库在未单独指定时使用的默认外观">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
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
            onChange={e => onFontSizeChange(Number(e.target.value))}
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
