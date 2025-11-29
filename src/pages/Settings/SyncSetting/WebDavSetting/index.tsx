import { produce } from "immer";
import useSettingStore from "@/stores/useSettingStore";
import { SettingInput } from "../../components";
import useThemeColors from "@/hooks/useThemeColors";

const WebDavSetting = () => {
  const { setting, integration } = useSettingStore((state) => ({
    setting: state.setting.sync.webdav,
    integration: state.setting.integration.webdav,
  }));

  const themeColors = useThemeColors();
  const { pathPrefix = "" } = setting;
  const { url = "", username = "", password = "" } = integration;

  if (!url || !username || !password) {
    return (
      <div className="p-4 rounded-xl bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20">
        <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <span className="text-sm font-medium">
            请先在【集成设置】中配置 WebDAV 凭证
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className={`p-3 rounded-lg text-sm ${themeColors.cardBgClass} border ${themeColors.cardBorderClass} ${themeColors.textClass}`}
      >
        WebDAV 服务器: {url}
      </div>
      <SettingInput
        label="路径前缀"
        value={pathPrefix}
        onChange={(e) => {
          useSettingStore.setState(
            produce((state) => {
              state.setting.sync.webdav.pathPrefix = e.target.value;
            }),
          );
        }}
        placeholder="如：/sync（可选）"
      />
    </div>
  );
};

export default WebDavSetting;
