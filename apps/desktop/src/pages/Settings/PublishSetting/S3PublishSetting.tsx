import { produce } from "immer";
import useSettingStore from "@/stores/useSettingStore";
import { SettingInput } from "../components";

const S3PublishSetting = () => {
  const { setting, integration } = useSettingStore((state) => ({
    setting: state.setting.publish.s3,
    integration: state.setting.integration.s3,
  }));

  const { bucket = "", region = "", path = "", basePath = "/" } = setting;
  const { accessKeyId = "", secretAccessKey = "", endpoint = "" } = integration;

  const hasCredentials = !!accessKeyId && !!secretAccessKey;

  if (!hasCredentials) {
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
        placeholder="my-blog-bucket"
        value={bucket}
        onChange={(value) => {
          useSettingStore.setState(
            produce((state) => {
              state.setting.publish.s3.bucket = value;
            }),
          );
        }}
        description="S3 存储桶名称"
      />

      <SettingInput
        label="Region"
        placeholder="us-east-1"
        value={region}
        onChange={(value) => {
          useSettingStore.setState(
            produce((state) => {
              state.setting.publish.s3.region = value;
            }),
          );
        }}
        description="S3 区域（如 us-east-1、ap-northeast-1）"
      />

      <SettingInput
        label="路径前缀"
        placeholder="blog/（可选）"
        value={path}
        onChange={(value) => {
          useSettingStore.setState(
            produce((state) => {
              state.setting.publish.s3.path = value;
            }),
          );
        }}
        description="文件上传到 Bucket 的子目录"
      />

      <SettingInput
        label="访问路径 (basePath)"
        placeholder="/"
        value={basePath}
        onChange={(value) => {
          useSettingStore.setState(
            produce((state) => {
              state.setting.publish.s3.basePath = value;
            }),
          );
        }}
        description="网站访问时的基础路径，如绑定了自定义域名可设为 /"
      />

      {endpoint && (
        <div className="p-3 rounded-lg text-sm bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400">
          <p className="font-medium mb-1">当前 Endpoint</p>
          <p className="text-xs font-mono">{endpoint}</p>
        </div>
      )}
    </div>
  );
};

export default S3PublishSetting;
