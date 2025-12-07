import { produce } from "immer";
import GithubSetting from "./GithubSetting";
import AliOssSetting from "./AliOssSetting";
import LocalSetting from "./LocalSetting";
import S3Setting from "./S3Setting";
import WebDavSetting from "./WebDavSetting";
import useSettingStore, { EImageBed } from "@/stores/useSettingStore";
import {
  SettingContainer,
  SettingSection,
  SettingTabs,
  SettingSwitch,
} from "../components";

const ResourceUploadSetting = () => {
  const { activeKey, enableCompression } = useSettingStore((state) => ({
    activeKey: state.setting.imageBed.active,
    enableCompression: state.setting.imageBed.enableCompression,
  }));

  const tabItems = [
    { key: EImageBed.Local, label: "本地" },
    { key: EImageBed.Github, label: "Github" },
    { key: EImageBed.AliOSS, label: "阿里云 OSS" },
    { key: EImageBed.S3, label: "S3" },
    { key: EImageBed.WebDav, label: "WebDAV" },
  ];

  const renderContent = () => {
    switch (activeKey) {
      case EImageBed.Local:
        return <LocalSetting />;
      case EImageBed.Github:
        return <GithubSetting />;
      case EImageBed.AliOSS:
        return <AliOssSetting />;
      case EImageBed.S3:
        return <S3Setting />;
      case EImageBed.WebDav:
        return <WebDavSetting />;
      default:
        return <LocalSetting />;
    }
  };

  return (
    <SettingContainer>
      <SettingSection
        title="资源存储"
        description="配置图片和文件的存储位置，支持本地存储和多种云存储服务"
      >
        <SettingTabs
          activeKey={activeKey}
          onChange={(key) => {
            useSettingStore.setState(
              produce((draft) => {
                draft.setting.imageBed.active = key;
              }),
            );
          }}
          items={tabItems}
        />

        <div className="mt-6">{renderContent()}</div>
      </SettingSection>

      <SettingSection title="压缩设置">
        <SettingSwitch
          checked={enableCompression}
          onChange={(checked) => {
            useSettingStore.setState(
              produce((draft) => {
                draft.setting.imageBed.enableCompression = checked;
              }),
            );
          }}
          label="启用图片压缩"
          description="上传时自动将 png/jpeg/jpg 格式转换为 webp 格式以减小体积"
        />
      </SettingSection>
    </SettingContainer>
  );
};

export default ResourceUploadSetting;
