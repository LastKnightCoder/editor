import useSettingStore from "@/stores/useSettingStore";
import useThemeColors from "@/hooks/useThemeColors";
import classNames from "classnames";

const LocalSetting = () => {
  const { local } = useSettingStore(state => ({
    local: state.setting.imageBed.local,
  }));
  const themeColors = useThemeColors();

  const { path } = local;

  return (
    <div className="space-y-4">
      <div
        className={classNames(
          "rounded-xl border p-4",
          themeColors.cardBgClass,
          themeColors.cardBorderClass
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={classNames(
              "flex h-10 w-10 items-center justify-center rounded-lg",
              themeColors.iconBgClass
            )}
          >
            <svg
              className={classNames("h-5 w-5", themeColors.secondaryTextClass)}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
          </div>
          <div>
            <div className={classNames("text-sm", themeColors.secondaryTextClass)}>存储路径</div>
            <div className={classNames("text-sm font-medium", themeColors.secondaryTextClass)}>
              {path || "默认数据库目录"}
            </div>
          </div>
        </div>
      </div>
      <p className={classNames("text-xs", themeColors.secondaryTextClass)}>
        本地存储将资源保存在当前数据库的 resources 目录下
      </p>
    </div>
  );
};

export default LocalSetting;
