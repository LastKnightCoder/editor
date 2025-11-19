import { Input, Space } from "antd";
import { produce } from "immer";
import useSettingStore from "@/stores/useSettingStore";
import If from "@/components/If";

const WebDavSetting = () => {
  const { webdav, integration } = useSettingStore((state) => ({
    webdav: state.setting.imageBed.webdav,
    integration: state.setting.integration.webdav,
  }));

  const { pathPrefix = "" } = webdav;
  const { url = "", username = "", password = "" } = integration;

  return (
    <Space direction="vertical" size="middle" style={{ display: "flex" }}>
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
            style={{ width: 500 }}
            value={pathPrefix}
            onChange={(e) => {
              useSettingStore.setState(
                produce((state) => {
                  state.setting.imageBed.webdav.pathPrefix = e.target.value;
                }),
              );
            }}
            allowClear
            placeholder="如：/images（可选）"
          />
        </Space>
      </If>
    </Space>
  );
};

export default WebDavSetting;
