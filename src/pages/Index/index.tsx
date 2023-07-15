import { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { Menu, MenuProps } from 'antd';
import { MdOutlineArticle, MdOutlineListAlt, MdStickyNote2 } from 'react-icons/md';
import { AiOutlineBarChart } from 'react-icons/ai';
import { MenuFoldOutlined, MenuUnfoldOutlined, } from '@ant-design/icons';
import classnames from 'classnames';

import styles from './index.module.less';

const items: MenuProps['items'] = [{
  key: 'card',
  label: '卡片管理',
  icon: <MdStickyNote2 />,
  children: [{
    icon: <MdOutlineListAlt />,
    key: 'card-list',
    label: <NavLink to={'/cards/list'}>卡片列表</NavLink>,
  }, {
    icon: <MdOutlineListAlt />,
    key: 'card-link-graph',
    label: <NavLink to={'/cards/link-graph'}>关系图谱</NavLink>,
  }]
}, {
  key: 'article',
  label: '文章管理',
  icon: <MdOutlineArticle />,
  children: [{
    icon: <MdOutlineListAlt />,
    key: 'article-list',
    label: <NavLink to={'/articles/list'}>文章列表</NavLink>,
  }]
}, {
  key: 'data-statistics',
  label: <NavLink to={'/statistic'}>数据统计</NavLink>,
  icon: <AiOutlineBarChart />,
}]

const Management = () => {
  const [collapsed, setCollapsed] = useState(true);

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
          items={items}
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
    </div>
  )
}

export default Management;