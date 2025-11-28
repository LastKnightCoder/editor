import { useMemoizedFn } from "ahooks";
import { produce } from "immer";
import useSettingStore from "@/stores/useSettingStore";

export type BackgroundType =
  | "solid"
  | "gradient1"
  | "gradient2"
  | "gradient3"
  | "gradient4"
  | "gradient5"
  | "gradient6";

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
];

const AppearanceSetting = () => {
  const { setting } = useSettingStore();

  const currentBackground = setting.appearance?.backgroundType || "solid";

  const handleSelect = useMemoizedFn((option: BackgroundOption) => {
    const newSetting = produce(setting, (draft) => {
      if (!draft.appearance) {
        draft.appearance = { backgroundType: "solid" };
      }
      draft.appearance.backgroundType = option.key;
    });
    useSettingStore.setState({ setting: newSetting });
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <h2 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">
        外观设置
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        选择设置页面的背景样式，渐变背景会让主体内容呈现磨砂质感
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {backgroundOptions.map((option) => {
          const isActive = currentBackground === option.key;
          return (
            <div
              key={option.key}
              onClick={() => handleSelect(option)}
              className={`
                relative overflow-hidden rounded-xl cursor-pointer
                transition-all duration-300 ease-in-out
                shadow-sm hover:shadow-xl
                border-2
                ${
                  isActive
                    ? "border-blue-500 dark:border-blue-600"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                }
              `}
            >
              {isActive && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-blue-500 via-blue-400 to-blue-500 dark:from-blue-600 dark:via-blue-500 dark:to-blue-600" />
              )}
              <div
                className={`
                  h-32 relative overflow-hidden
                  ${option.key === "solid" ? "bg-white dark:bg-gray-900" : ""}
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

                {/* 磨砂卡片示例 */}
                {option.key !== "solid" && (
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    <div className="w-full h-10 rounded-lg bg-white/50 dark:bg-[#0a0a0a]/40 backdrop-blur-xl backdrop-saturate-150 border border-white/20 dark:border-white/10 shadow-lg" />
                  </div>
                )}
              </div>

              {/* 信息区域 */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800/50">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  {option.label}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {option.description}
                </p>
              </div>

              {/* 选中状态标识 */}
              {isActive && (
                <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-blue-500 dark:bg-blue-600 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-white"
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
    </div>
  );
};

export default AppearanceSetting;
