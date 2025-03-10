import { Modal, Tabs, TabsProps } from "antd";
import { useEffect } from "react";
import { useMemoizedFn } from "ahooks";

import useSettingStore from "@/stores/useSettingStore.ts";
import { saveSetting } from "@/commands";

import AppAbout from "./AppAbout";
import FontSetting from "./FontSetting";
import ImageBedSetting from "./ImageBedSetting";
import SyncSetting from "./SyncSetting";
import ModuleSetting from "./ModuleSetting";
import TextToSpeechSetting from "./TextToSpeechSetting";
import LLMProviderSetting from "./LLMProviderSetting";

import styles from './index.module.less';

const SettingModal = () => {
  const {
    open,
    setting,
    inited,
  } = useSettingStore(state => ({
    open: state.settingModalOpen,
    setting: state.setting,
    inited: state.inited,
  }));

  const close = useMemoizedFn(() => {
    useSettingStore.setState({ settingModalOpen: false });
  });

  useEffect(() => {
    if (!inited) return;
    saveSetting(JSON.stringify(setting, null, 2)).then();
  }, [inited, setting]);

  const items: TabsProps['items'] = [{
    key: 'app',
    label: '关于软件',
    children: <AppAbout />,
  },  {
    key: 'font',
    label: '字体',
    children: <FontSetting />,
  }, {
    key: 'imageBed',
    label: '图床',
    children: <ImageBedSetting />,
  }, {
    key: 'sync',
    label: '同步',
    children: <SyncSetting />,
  }, {
    key: 'llm',
    label: '大语言模型',
    children: <LLMProviderSetting />,
  }, {
    key: 'textToSpeech',
    label: '文字转语音',
    children: <TextToSpeechSetting />,
  }, {
    key: 'module',
    label: '模块功能',
    children: <ModuleSetting />,
  },]

  return (
    <Modal
      title={'设置'}
      open={open}
      footer={null}
      onCancel={close}
      width={820}
      styles={{
        body: {
          minHeight: 300,
          maxHeight: 'calc(100vh - 160px)',
          overflow: 'auto',
        }
      }}
    >
      <Tabs
        tabPosition={'left'}
        items={items}
        className={styles.tabs}
      />
    </Modal>
  )
}

export default SettingModal;
