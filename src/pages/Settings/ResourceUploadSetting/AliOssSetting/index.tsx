import { useEffect, useState } from "react";
import useSettingStore from "@/stores/useSettingStore";
import { produce } from "immer";
import { getBucketList } from "@/commands";
import { SettingInput, SettingDropdown } from "../../components";

const AliOssSetting = () => {
  const { setting, integration } = useSettingStore((state) => ({
    setting: state.setting.imageBed.aliOSS,
    integration: state.setting.integration.aliOSS,
  }));

  const { bucket = "", region = "", pathPrefix = "" } = setting;
  const { accessKeyId = "", accessKeySecret = "" } = integration;
  const [bucketsInfo, setBucketsInfo] = useState<
    Array<{
      bucket: string;
      region: string;
    }>
  >([]);

  const onSelectBucket = (bucket: string) => {
    const bucketInfo = bucketsInfo.find(
      (bucketInfo) => bucketInfo.bucket === bucket,
    );
    if (!bucketInfo) return;
    const { region } = bucketInfo;
    useSettingStore.setState(
      produce((state) => {
        state.setting.imageBed.aliOSS.bucket = bucket;
        state.setting.imageBed.aliOSS.region = region;
      }),
    );
  };

  useEffect(() => {
    if (!accessKeySecret || !accessKeyId) return;
    getBucketList(accessKeyId, accessKeySecret)
      .then((bucketsInfo) => {
        setBucketsInfo(bucketsInfo);
      })
      .catch(() => {
        setBucketsInfo([]);
        useSettingStore.setState(
          produce((draft) => {
            draft.setting.imageBed.aliOSS.bucket = "";
            draft.setting.imageBed.aliOSS.region = "";
          }),
        );
      });
  }, [accessKeySecret, accessKeyId]);

  if (!accessKeyId || !accessKeySecret) {
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
            请先在【集成设置】中配置阿里云 OSS 凭证
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(bucketsInfo.length > 0 || (!!bucket && !!region)) && (
        <SettingDropdown
          label="Bucket"
          value={bucket}
          onChange={onSelectBucket}
          options={bucketsInfo.map((bucketInfo) => ({
            label: bucketInfo.bucket,
            value: bucketInfo.bucket,
          }))}
        />
      )}
      <SettingInput
        label="路径前缀"
        placeholder="留空表示根目录，如：images/"
        value={pathPrefix}
        onChange={(e) => {
          useSettingStore.setState(
            produce((state) => {
              state.setting.imageBed.aliOSS.pathPrefix = e.target.value;
            }),
          );
        }}
      />
    </div>
  );
};

export default AliOssSetting;
