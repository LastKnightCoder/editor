import useSettingStore from "@/hooks/useSettingStore.ts";
import {Input, Modal, InputNumber} from "antd";
import {useEffect} from "react";

import styles from './index.module.less';

const SettingModal = () => {
  const {
    open,
    setOpen,
    fontSetting,
    onChineseFontChange,
    onEnglishFontChange,
    onFontSizeChange,
  } = useSettingStore(state => ({
    open: state.settingModalOpen,
    setOpen: state.setSettingModalOpen,
    fontSetting: state.fontSetting,
    onChineseFontChange: state.onChineseFontChange,
    onEnglishFontChange: state.onEnglishFontChange,
    onFontSizeChange: state.onFontSizeChange,
  }));

  const close = () => {
    setOpen(false);
  }

  useEffect(() => {
    const { chineseFont, englishFont, fontSize } = fontSetting;
    const finalFont = `${englishFont}, ${chineseFont}`;
    document.body.style.setProperty('--font', finalFont);
    document.body.style.setProperty('--font-size', `${fontSize}px`);
    localStorage.setItem('fontSetting', JSON.stringify(fontSetting));
  }, [fontSetting]);

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