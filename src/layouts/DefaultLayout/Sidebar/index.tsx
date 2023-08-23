import React from 'react';
import classnames from "classnames";

import { SettingOutlined } from '@ant-design/icons';
import { MdOutlineDarkMode, MdOutlineLightMode } from 'react-icons/md';
import IconText from "@/components/IconText";

import styles from './index.module.less';
import useSettingStore from "@/hooks/useSettingStore.ts";

interface ISidebarProps {
  className?: string;
  style?: React.CSSProperties;
}

const Sidebar = (props: ISidebarProps) => {
  const { className, style } = props;

  const {
    setSettingModalOpen,
    darkMode,
  } = useSettingStore(state => ({
    setSettingModalOpen: state.setSettingModalOpen,
    darkMode: state.darkMode,
  }));

  return (
    <div className={classnames(styles.sidebar, className)} style={style}>
      <div>

      </div>
      <div className={styles.settingList}>
        <IconText
          icon={darkMode ? <MdOutlineLightMode /> : <MdOutlineDarkMode />}
          text={darkMode ? '浅色' : '深色'}
          onClick={() => { useSettingStore.setState({ darkMode: !darkMode }) }}
        />
        <IconText
          icon={<SettingOutlined />}
          text={'设置'}
          onClick={() => { setSettingModalOpen(true) }} />
      </div>
    </div>
  )
}

export default Sidebar;