import { Tabs, TabsProps } from "antd";

import AppAbout from "./AppAbout";
import AppearanceSetting from "./AppearanceSetting";
import FontSetting from "./FontSetting";
import ResourceUploadSetting from "./ResourceUploadSetting";
import SyncSetting from "./SyncSetting";
import ModuleSetting from "./ModuleSetting";
import TextToSpeechSetting from "./TextToSpeechSetting";
import LLMProviderSetting from "./LLMProviderSetting";
import EmbeddingProviderSetting from "./EmbeddingProviderSetting";
import IntegrationSetting from "./IntegrationSetting";
import CustomBlockSetting from "./CustomBlockSetting";

import styles from "./index.module.less";

const SettingsPage = () => {
  const items: TabsProps["items"] = [
    {
      key: "app",
      label: "关于软件",
      children: <AppAbout />,
    },
    {
      key: "appearance",
      label: "外观",
      children: <AppearanceSetting />,
    },
    {
      key: "font",
      label: "字体",
      children: <FontSetting />,
    },
    {
      key: "imageBed",
      label: "资源存储",
      children: <ResourceUploadSetting />,
    },
    {
      key: "sync",
      label: "同步",
      children: <SyncSetting />,
    },
    {
      key: "llm",
      label: "大语言模型",
      children: <LLMProviderSetting />,
    },
    {
      key: "embedding",
      label: "嵌入模型",
      children: <EmbeddingProviderSetting />,
    },
    {
      key: "textToSpeech",
      label: "文字转语音",
      children: <TextToSpeechSetting />,
    },
    {
      key: "module",
      label: "模块功能",
      children: <ModuleSetting />,
    },
    {
      key: "customBlock",
      label: "自定义组件",
      children: <CustomBlockSetting />,
    },
    {
      key: "integration",
      label: "集成",
      children: <IntegrationSetting />,
    },
  ];

  return (
    <div className="w-full h-full flex flex-col box-border overflow-hidden gap-2 relative">
      <div className="flex flex-1 overflow-hidden relative z-10">
        <Tabs tabPosition={"left"} items={items} className={styles.tabs} />
      </div>
    </div>
  );
};

export default SettingsPage;
