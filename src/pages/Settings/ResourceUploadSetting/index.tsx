import { Tabs, TabsProps, Switch, Space } from "antd";
import { produce } from "immer";
import GithubSetting from "./GithubSetting";
import AliOssSetting from "./AliOssSetting";
import LocalSetting from "./LocalSetting";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore.ts";

const ResourceUploadSetting = () => {
  const { activeKey, enableCompression } = useSettingStore((state) => ({
    activeKey: state.setting.imageBed.active,
    enableCompression: state.setting.imageBed.enableCompression,
  }));

  const items: TabsProps["items"] = [
    {
      key: EImageBed.Local,
      label: "本地",
      children: <LocalSetting />,
    },
    {
      key: EImageBed.Github,
      label: "Github",
      children: <GithubSetting />,
    },
    {
      key: EImageBed.AliOSS,
      label: "阿里云 OSS",
      children: <AliOssSetting />,
    },
  ];

  return (
    <div>
      <Tabs
        activeKey={activeKey}
        onChange={(key) => {
          useSettingStore.setState(
            produce((draft) => {
              draft.setting.imageBed.active = key;
            }),
          );
        }}
        items={items}
      />
      <Space
        direction="vertical"
        size="middle"
        style={{ width: "100%", marginBottom: 16 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 16,
          }}
        >
          <Switch
            checked={enableCompression}
            onChange={(checked) => {
              useSettingStore.setState(
                produce((draft) => {
                  draft.setting.imageBed.enableCompression = checked;
                }),
              );
            }}
          />
          <span>启用图片压缩 (png/jpeg/jpg → webp)</span>
        </div>
      </Space>
    </div>
  );
};

export default ResourceUploadSetting;
