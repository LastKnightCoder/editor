import useSettingStore from "@/stores/useSettingStore.ts";
import { useEffect, useState } from "react";
import { produce } from "immer";
import { getBucketList } from "@/commands";
import { Flex, Input, message, Select, Space } from "antd";
import If from "@/components/If";

const AliOssSetting = () => {
  const { setting, integration } = useSettingStore((state) => ({
    setting: state.setting.sync.aliOSS,
    integration: state.setting.integration.aliOSS,
  }));

  const { bucket = "", region = "", path = "/" } = setting;
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
        state.setting.sync.aliOSS.bucket = bucket;
        state.setting.sync.aliOSS.region = region;
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
        message.error("校验失败");
        setBucketsInfo([]);
        useSettingStore.setState(
          produce((draft) => {
            draft.setting.sync.aliOSS.bucket = "";
            draft.setting.sync.aliOSS.region = "";
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
          <Flex vertical gap={10}>
            <Space>
              <div>Bucket：</div>
              <Space>
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
            </Space>
            <Space>
              <div>路径：</div>
              <Space>
                <Input
                  width={600}
                  value={path}
                  onChange={(e) => {
                    useSettingStore.setState(
                      produce((state) => {
                        state.setting.sync.aliOSS.path = e.target.value;
                      }),
                    );
                  }}
                  allowClear
                />
              </Space>
            </Space>
          </Flex>
        </If>
      </If>
    </Flex>
  );
};

export default AliOssSetting;
