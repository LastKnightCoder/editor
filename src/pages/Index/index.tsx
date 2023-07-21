import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu, Tooltip } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined, SettingOutlined } from '@ant-design/icons';
import { MdHelpOutline } from 'react-icons/md';
import { PiDiceThree } from 'react-icons/pi';
import classnames from 'classnames';
import { getTagsById, getCardHistory } from '@/commands';
import {open} from '@tauri-apps/api/shell';

import { menuConfigs } from '@/configs';

import styles from './index.module.less';

const topActions = [{
  icon: <MdHelpOutline />,
  label: '帮助文档',
  key: 'help',
  onClick: () => {
    open('https://www.bilibili.com');
  },
}, {
  icon: <PiDiceThree />,
  label: '随机卡片',
  key: 'random',
  onClick: async () => {
    const history = await getCardHistory(1, 1, 10);
    console.log('history', history);
  },
}];

const bottomActions = [{
  icon: <SettingOutlined />,
  label: '设置',
  key: 'setting',
  onClick: async () => {
    console.log('setting');
    const tags = await getTagsById(10);
    console.log(tags);
  },
}]

const Management = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        <Menu
          inlineCollapsed={collapsed}
          className={classnames(styles.menu, {
            [styles.collapsed]: collapsed,
          })}
          defaultOpenKeys={['card']}
          defaultSelectedKeys={['card-list']}
          mode="inline"
          items={menuConfigs}
          style={{
            minWidth: 0,
            flex: 'auto',
          }}
        />
        <div className={styles.collapsedIcon}>
          { collapsed
            ? <MenuUnfoldOutlined onClick={() => setCollapsed(false)} />
            : <MenuFoldOutlined onClick={() => setCollapsed(true)} />
          }
        </div>
      </div>
      <div className={classnames(styles.detail, {
        [styles.collapsed]: collapsed,
      })}>
        <Outlet />
      </div>
      <div className={styles.rightActions}>
        <div className={styles.actions}>
          {
            topActions.map(action => (
              <Tooltip title={action.label} placement={'left'} key={action.key}>
                <div className={styles.action} onClick={action.onClick}>
                  {action.icon}
                </div>
              </Tooltip>
            ))
          }
        </div>
        <div className={styles.actions}>
          {
            bottomActions.map(action => (
              <Tooltip title={action.label} placement={'left'} key={action.key}>
                <div className={styles.action} onClick={action.onClick}>
                  {action.icon}
                </div>
              </Tooltip>
            ))
          }
        </div>
      </div>
    </div>
  )
}

export default Management;