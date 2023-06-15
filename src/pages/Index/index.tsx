import { Outlet, NavLink } from "react-router-dom";

import styles from './index.module.less';

const menuList = [{
  path: '/cards',
  title: '卡片管理',
}, {
  path: '/articles',
  title: '文章管理',
}, {
  path: '/editor',
  title: '编辑器',
}];

const Management = () => {

  return (
    <div className={styles.container}>
      <div className={styles.sidebar}>
        {
          menuList.map(item => {
            return (
              <div key={item.path} className={styles.menuItem}>
                <NavLink to={item.path}>{item.title}</NavLink>
              </div>
            )
          })
        }
      </div>
      <div className={styles.detail}>
        <Outlet />
      </div>
    </div>
  )
}

export default Management;