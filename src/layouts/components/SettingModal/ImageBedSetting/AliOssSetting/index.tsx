import { useEffect, useState } from "react";
import { Input, Select, Space } from "antd";
import useSettingStore from "@/stores/useSettingStore.ts";
import { produce } from "immer";
import { getBucketList } from "@/commands";
import If from "@/components/If";

const AliOssSetting = () => {
  const { setting } = useSettingStore((state) => ({
    setting: state.setting.imageBed.aliOSS,
  }));

  const {
    accessKeyId = "",
    accessKeySecret = "",
    bucket = "",
    region = "",
  } = setting;
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
    <Space direction="vertical" size="middle" style={{ display: "flex" }}>
      <Space>
        <div>accessKeyId：</div>
        <Space>
          <Input.Password
            width={500}
            value={accessKeyId}
            onChange={(e) => {
              useSettingStore.setState(
                produce((state) => {
                  state.setting.imageBed.aliOSS.accessKeyId = e.target.value;
                }),
              );
            }}
            allowClear
          />
        </Space>
      </Space>
      <Space>
        <div>accessKeySecret：</div>
        <Space>
          <Input.Password
            width={600}
            value={accessKeySecret}
            onChange={(e) => {
              useSettingStore.setState(
                produce((state) => {
                  state.setting.imageBed.aliOSS.accessKeySecret =
                    e.target.value;
                }),
              );
            }}
            allowClear
          />
        </Space>
      </Space>
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
    </Space>
  );
};

export default AliOssSetting;
