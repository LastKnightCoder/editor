import { useEffect, useState } from "react";
import { Flex, Input, Select, Space } from "antd";
import useSettingStore from "@/stores/useSettingStore.ts";
import { produce } from "immer";
import { getBucketList } from "@/commands";
import If from "@/components/If";

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

  return (
    <Flex vertical gap={10}>
      <If condition={!accessKeyId || !accessKeySecret}>
        <div className="p-3  border border-[#f0f0f0] dark:border-[#2a2a2a] rounded-md">
          请先在【集成设置】中配置阿里云 OSS 凭证
        </div>
      </If>
      <If condition={!!accessKeyId && !!accessKeySecret}>
        <If condition={bucketsInfo.length > 0 || (!!bucket && !!region)}>
          <Space>
            <div>Bucket：</div>
            <Select
              style={{ width: 400 }}
              options={bucketsInfo.map((bucketInfo) => ({
                label: bucketInfo.bucket,
                value: bucketInfo.bucket,
              }))}
              onChange={onSelectBucket}
              value={bucket}
            />
          </Space>
        </If>
        <Space>
          <div>路径前缀：</div>
          <Input
            style={{ width: 400 }}
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
        </Space>
      </If>
    </Flex>
  );
};

export default AliOssSetting;
