import { Outlet, Routes, Route } from 'react-router-dom';

import Sidebar from './components/Sidebar';
import Titlebar from '../components/Titlebar';
import CardTitlebar from './components/Titlebar/CardTitlebar';

import styles from './index.module.less';

const ShortSidebarLayout = () => {
  return (
    <div className={styles.container}>
      <Sidebar className={styles.sidebar} />
      <div className={styles.content}>
        <div className={styles.titlebar}>
          <Routes>
            <Route path='/' element={<Titlebar />}>
              <Route path="cards/*" element={<CardTitlebar />} />
              <Route path="*" element={<div />} />
            </Route>
          </Routes>
        </div>
        <Outlet />
      </div>
    </div>
  )
}

export default ShortSidebarLayout;
