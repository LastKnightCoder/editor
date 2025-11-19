import useSettingStore from "@/stores/useSettingStore.ts";
import { produce } from "immer";
import { Flex, Input, Space } from "antd";
import If from "@/components/If";

const S3Setting = () => {
  const { setting, integration } = useSettingStore((state) => ({
    setting: state.setting.sync.s3,
    integration: state.setting.integration.s3,
  }));

  const { bucket = "", region = "", pathPrefix = "" } = setting;
  const { accessKeyId = "", secretAccessKey = "", endpoint = "" } = integration;

  return (
    <Flex vertical gap={10}>
      <If condition={!accessKeyId || !secretAccessKey}>
        <div className="p-3  border border-[#f0f0f0] dark:border-[#2a2a2a] rounded-md">
          请先在【集成设置】中配置 S3 凭证
        </div>
      </If>
      <If condition={!!accessKeyId && !!secretAccessKey}>
        <Space>
          <div>Bucket：</div>
          <Input
            style={{ width: 400 }}
            value={bucket}
            onChange={(e) => {
              useSettingStore.setState(
                produce((state) => {
                  state.setting.sync.s3.bucket = e.target.value;
                }),
              );
            }}
            allowClear
            placeholder="请输入 Bucket 名称"
          />
        </Space>
        <Space>
          <div>Region：</div>
          <Input
            style={{ width: 400 }}
            value={region}
            onChange={(e) => {
              useSettingStore.setState(
                produce((state) => {
                  state.setting.sync.s3.region = e.target.value;
                }),
              );
            }}
            allowClear
            placeholder="如：us-east-1"
          />
        </Space>
        <Space>
          <div>路径前缀：</div>
          <Input
            style={{ width: 400 }}
            value={pathPrefix}
            onChange={(e) => {
              useSettingStore.setState(
                produce((state) => {
                  state.setting.sync.s3.pathPrefix = e.target.value;
                }),
              );
            }}
            allowClear
            placeholder="如：sync/（可选）"
          />
        </Space>
        <If condition={!!endpoint}>
          <div
            style={{
              padding: "8px",
              background: "#f0f0f0",
              borderRadius: "4px",
              fontSize: "12px",
            }}
          >
            使用自定义端点: {endpoint}
          </div>
        </If>
      </If>
    </Flex>
  );
};

export default S3Setting;
