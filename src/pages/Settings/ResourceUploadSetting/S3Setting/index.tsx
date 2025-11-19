import { Input, Space, Flex } from "antd";
import { produce } from "immer";
import useSettingStore from "@/stores/useSettingStore";
import If from "@/components/If";

const S3Setting = () => {
  const { s3, integration } = useSettingStore((state) => ({
    s3: state.setting.imageBed.s3,
    integration: state.setting.integration.s3,
  }));

  const { bucket = "", region = "", pathPrefix = "" } = s3;
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
            style={{ width: 500 }}
            value={bucket}
            onChange={(e) => {
              useSettingStore.setState(
                produce((state) => {
                  state.setting.imageBed.s3.bucket = e.target.value;
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
            style={{ width: 500 }}
            value={region}
            onChange={(e) => {
              useSettingStore.setState(
                produce((state) => {
                  state.setting.imageBed.s3.region = e.target.value;
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
            style={{ width: 500 }}
            value={pathPrefix}
            onChange={(e) => {
              useSettingStore.setState(
                produce((state) => {
                  state.setting.imageBed.s3.pathPrefix = e.target.value;
                }),
              );
            }}
            allowClear
            placeholder="如：images/（可选）"
          />
        </Space>
        <If condition={!!endpoint}>
          <div className="p-2 text-sm bg-[#f0f0f0] dark:bg-[#2a2a2a] rounded-md">
            使用自定义端点: {endpoint}
          </div>
        </If>
      </If>
    </Flex>
  );
};

export default S3Setting;
