import { produce } from "immer";
import useSettingStore from "@/stores/useSettingStore";
import { SettingInput } from "../../components";
import useThemeColors from "@/hooks/useThemeColors";

const S3Setting = () => {
  const { setting, integration } = useSettingStore((state) => ({
    setting: state.setting.sync.s3,
    integration: state.setting.integration.s3,
  }));

  const themeColors = useThemeColors();
  const { bucket = "", region = "", pathPrefix = "" } = setting;
  const { accessKeyId = "", secretAccessKey = "", endpoint = "" } = integration;

  if (!accessKeyId || !secretAccessKey) {
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
            请先在【集成设置】中配置 S3 凭证
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SettingInput
        label="Bucket"
        value={bucket}
        onChange={(e) => {
          useSettingStore.setState(
            produce((state) => {
              state.setting.sync.s3.bucket = e.target.value;
            }),
          );
        }}
        placeholder="请输入 Bucket 名称"
      />
      <SettingInput
        label="Region"
        value={region}
        onChange={(e) => {
          useSettingStore.setState(
            produce((state) => {
              state.setting.sync.s3.region = e.target.value;
            }),
          );
        }}
        placeholder="如：us-east-1"
      />
      <SettingInput
        label="路径前缀"
        value={pathPrefix}
        onChange={(e) => {
          useSettingStore.setState(
            produce((state) => {
              state.setting.sync.s3.pathPrefix = e.target.value;
            }),
          );
        }}
        placeholder="如：sync/（可选）"
      />
      {!!endpoint && (
        <div className={`p-3 text-sm bg-transparent ${themeColors.textClass}`}>
          使用自定义端点: {endpoint}
        </div>
      )}
    </div>
  );
};

export default S3Setting;
