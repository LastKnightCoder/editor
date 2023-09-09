import {Input, Modal, InputNumber} from "antd";
import {useEffect, useMemo} from "react";

import useSettingStore from "@/stores/useSettingStore.ts";
import { saveSetting } from "@/commands";

import styles from './index.module.less';
import { produce } from "immer";

const SettingModal = () => {
  const {
    open,
    setting,
    onFontSettingChange,
    initSetting,
  } = useSettingStore(state => ({
    open: state.settingModalOpen,
    setOpen: state.setSettingModalOpen,
    setting: state.setting,
    onFontSettingChange: state.onFontSettingChange,
    initSetting: state.initSetting,
  }));

  const close = () => {
    useSettingStore.setState({ settingModalOpen: false });
  }

  useEffect(() => {
    initSetting();
  }, [])

  useEffect(() => {
    saveSetting(JSON.stringify(setting, null, 2)).then();
  }, [setting]);

  const fontSetting = useMemo(() => {
    return setting.fontSetting;
  }, [setting]);

  useEffect(() => {
    const { chineseFont, englishFont, fontSize } = fontSetting;
    const font = `${englishFont}, ${chineseFont}`;
    document.body.style.setProperty('--font', font);
    document.body.style.setProperty('--font-size', `${fontSize}px`);
  }, [fontSetting]);

  const onChineseFontChange = (font: string) => {
    onFontSettingChange(produce(fontSetting, draft => {
      draft.chineseFont = font;
    }));
  }

  const onEnglishFontChange = (font: string) => {
    onFontSettingChange(produce(fontSetting, draft => {
      draft.englishFont = font;
    }));
  }

  const onFontSizeChange = (size: number) => {
    onFontSettingChange(produce(fontSetting, draft => {
      draft.fontSize = size;
    }));
  }

  return (
    <Modal
      title={null}
      open={open}
      footer={null}
      onCancel={close}
      width={600}
    >
      <div className={styles.settingGroup}>
        <div className={styles.settingTitle}>字体</div>
        <div className={styles.inputItem}>
          <div className={styles.label}>中文字体：</div>
          <Input
            value={fontSetting.chineseFont}
            onChange={(e) => {
              onChineseFontChange(e.target.value)
            }}
          />
        </div>
        <div className={styles.inputItem}>
          <div className={styles.label}>英文字体：</div>
          <Input
            value={fontSetting.englishFont}
            onChange={(e) => {
              onEnglishFontChange(e.target.value)
            }}
          />
        </div>
        <div className={styles.inputItem}>
          <div className={styles.label}>字体大小：</div>
          <InputNumber
            min={12}
            controls={false}
            value={fontSetting.fontSize}
            type={'number'}
            onChange={(size) => {
              onFontSizeChange(size as number);
            }}
          />
        </div>
      </div>
    </Modal>
  )
}

export default SettingModal;