import { Tabs, TabsProps } from "antd";
import { produce } from "immer";
import GithubSetting from "./GithubSetting";
import AliOssSetting from "./AliOssSetting";
import LocalSetting from "./LocalSetting";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore.ts";

const ResourceUploadSetting = () => {
  const { activeKey } = useSettingStore((state) => ({
    activeKey: state.setting.imageBed.active,
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
  );
};

export default ResourceUploadSetting;
