import useSettingStore from "@/hooks/useSettingStore.ts";
import {Input, Modal} from "antd";
import {useEffect} from "react";

import styles from './index.module.less';

const SettingModal = () => {
  const {
    open,
    setOpen,
    fontSetting,
    onChineseFontChange,
    onEnglishFontChange,
  } = useSettingStore(state => ({
    open: state.settingModalOpen,
    setOpen: state.setSettingModalOpen,
    fontSetting: state.fontSetting,
    onChineseFontChange: state.onChineseFontChange,
    onEnglishFontChange: state.onEnglishFontChange,
  }));

  const close = () => {
    setOpen(false);
  }

  useEffect(() => {
    const { chineseFont, englishFont } = fontSetting;
    const finalFont = `${englishFont}, ${chineseFont}`;
    document.body.style.setProperty('--font', finalFont);
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
              console.log('e', e);
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
      </div>
    </Modal>
  )
}

export default SettingModal;