import { Tabs, TabsProps } from "antd";

import AppAbout from "./AppAbout";
import FontSetting from "./FontSetting";
import ResourceUploadSetting from "./ResourceUploadSetting";
import SyncSetting from "./SyncSetting";
import ModuleSetting from "./ModuleSetting";
import TextToSpeechSetting from "./TextToSpeechSetting";
import LLMProviderSetting from "./LLMProviderSetting";
import EmbeddingProviderSetting from "./EmbeddingProviderSetting";

import styles from "./index.module.less";

const SettingsPage = () => {
  const items: TabsProps["items"] = [
    {
      key: "app",
      label: "关于软件",
      children: <AppAbout />,
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
  ];

  return (
    <div className={styles.settingsPage}>
      <h1 className={styles.title}>设置</h1>
      <div className={styles.content}>
        <Tabs tabPosition={"left"} items={items} className={styles.tabs} />
      </div>
    </div>
  );
};

export default SettingsPage;
