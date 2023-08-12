import React from 'react';
import classnames from "classnames";

import { SettingOutlined } from '@ant-design/icons';
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
    setSettingModalOpen
  } = useSettingStore(state => ({
    setSettingModalOpen: state.setSettingModalOpen,
  }));

  return (
    <div className={classnames(styles.sidebar, className)} style={style}>
      <div>

      </div>
      <div>
        <IconText
          icon={<SettingOutlined />}
          text={'设置'}
          onClick={() => { setSettingModalOpen(true) }} />
      </div>
    </div>
  )
}

export default Sidebar;