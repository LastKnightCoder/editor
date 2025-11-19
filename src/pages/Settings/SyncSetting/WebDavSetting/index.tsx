import useSettingStore from "@/stores/useSettingStore.ts";
import { produce } from "immer";
import { Flex, Input, Space } from "antd";
import If from "@/components/If";

const WebDavSetting = () => {
  const { setting, integration } = useSettingStore((state) => ({
    setting: state.setting.sync.webdav,
    integration: state.setting.integration.webdav,
  }));

  const { pathPrefix = "" } = setting;
  const { url = "", username = "", password = "" } = integration;

  return (
    <Flex vertical gap={10}>
      <If condition={!url || !username || !password}>
        <div className="p-3  border border-[#f0f0f0] dark:border-[#2a2a2a] rounded-md">
          请先在【集成设置】中配置 WebDAV 凭证
        </div>
      </If>
      <If condition={!!url && !!username && !!password}>
        <div className="p-2 text-sm bg-[#f0f0f0] dark:bg-[#2a2a2a] rounded-md">
          WebDAV 服务器: {url}
        </div>
        <Space>
          <div>路径前缀：</div>
          <Input
            style={{ width: 400 }}
            value={pathPrefix}
            onChange={(e) => {
              useSettingStore.setState(
                produce((state) => {
                  state.setting.sync.webdav.pathPrefix = e.target.value;
                }),
              );
            }}
            allowClear
            placeholder="如：/sync（可选）"
          />
        </Space>
      </If>
    </Flex>
  );
};

export default WebDavSetting;
