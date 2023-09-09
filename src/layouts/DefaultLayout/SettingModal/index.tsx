import {Modal, Tabs, TabsProps} from "antd";
import { useEffect } from "react";

import useSettingStore from "@/stores/useSettingStore.ts";
import { saveSetting } from "@/commands";

import FontSetting from "./FontSetting";
import ImageBedSetting from "./ImageBedSetting";
import styles from './index.module.less';

const SettingModal = () => {
  const {
    open,
    setting,
    initSetting,
  } = useSettingStore(state => ({
    open: state.settingModalOpen,
    setting: state.setting,
    initSetting: state.initSetting,
  }));

  const close = () => {
    useSettingStore.setState({ settingModalOpen: false });
  }

  useEffect(() => {
    initSetting();
  }, []);

  useEffect(() => {
    saveSetting(JSON.stringify(setting, null, 2)).then();
  }, [setting]);

  const items: TabsProps['items'] = [{
    key: 'font',
    label: '字体',
    children: <FontSetting />,
  }, {
    key: 'imageBed',
    label: '图床',
    children: <ImageBedSetting />,
  }]

  return (
    <Modal
      title={'设置'}
      open={open}
      footer={null}
      onCancel={close}
      width={800}
      centered
      bodyStyle={{
        height: 'calc(100vh - 160px)',
        // paddingTop: 40,
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