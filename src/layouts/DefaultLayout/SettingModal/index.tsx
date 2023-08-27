import {Input, Modal, InputNumber} from "antd";
import { useEffect } from "react";

import useSettingStore from "@/stores/useSettingStore.ts";
import { DEFAULT_FONT_SETTING, DEFAULT_DARK_MODE } from "@/constants";

import styles from './index.module.less';

const SettingModal = () => {
  const {
    open,
    setOpen,
    fontSetting,
    onChineseFontChange,
    onEnglishFontChange,
    onFontSizeChange,
    darkMode,
  } = useSettingStore(state => ({
    open: state.settingModalOpen,
    setOpen: state.setSettingModalOpen,
    fontSetting: state.fontSetting,
    onChineseFontChange: state.onChineseFontChange,
    onEnglishFontChange: state.onEnglishFontChange,
    onFontSizeChange: state.onFontSizeChange,
    darkMode: state.darkMode,
  }));

  const close = () => {
    setOpen(false);
  }

  useEffect(() => {
    const darkMode = JSON.parse(localStorage.getItem('darkMode') || JSON.stringify(DEFAULT_DARK_MODE));
    const fontSetting = JSON.parse(localStorage.getItem('fontSetting') || JSON.stringify(DEFAULT_FONT_SETTING));
    useSettingStore.setState({ fontSetting });
    setTimeout(() => {
      useSettingStore.setState({ darkMode });
    }, 50)
  }, [])

  useEffect(() => {
    const { chineseFont, englishFont, fontSize } = fontSetting;
    const finalFont = `${englishFont}, ${chineseFont}`;
    document.body.style.setProperty('--font', finalFont);
    document.body.style.setProperty('--font-size', `${fontSize}px`);
    localStorage.setItem('fontSetting', JSON.stringify(fontSetting));
  }, [fontSetting]);

  useEffect(() => {
    const theme = darkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

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
              onFontSizeChange(size!);
            }}
          />
        </div>
      </div>
    </Modal>
  )
}

export default SettingModal;