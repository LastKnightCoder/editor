import React, { useEffect, useState } from 'react';
import classnames from "classnames";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";

import WindowControl from "@/components/WindowControl";

import styles from './index.module.less';

interface ITitleBarProps {
  className?: string;
  style?: React.CSSProperties;
}

enum ENavKey {
  CARDS = 'CARDS',
  ARTICLES = 'ARTICLES',
  DAILY = 'DAILY',
  DOCUMENTS = 'DOCUMENTS',
  STATISTIC = 'STATISTIC',
  TIME_RECORD = 'TIME_RECORD',
}

const configs = [{
  key: ENavKey.CARDS,
  title: '卡片',
  path: '/cards'
}, {
  key: ENavKey.ARTICLES,
  title: '文章',
  path: '/articles'
}, {
  key: ENavKey.DOCUMENTS,
  title: '知识库',
  path: '/documents'
}, {
  key: ENavKey.DAILY,
  title: '日记',
  path: '/daily'
}, {
  key: ENavKey.TIME_RECORD,
  title: '时间记录',
  path: '/time-record'
}]

const TitleBar = (props: ITitleBarProps) => {
  const { className, style } = props;
  const [activeNavKey, setActiveNavKey] = useState<ENavKey>(ENavKey.CARDS);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const { pathname } = location;
    if (pathname.startsWith('/cards')) {
      setActiveNavKey(ENavKey.CARDS);
    } else if (pathname.startsWith('/articles')) {
      setActiveNavKey(ENavKey.ARTICLES);
    } else if (pathname.startsWith('/daily')) {
      setActiveNavKey(ENavKey.DAILY);
    } else if (pathname.startsWith('/documents')) {
      setActiveNavKey(ENavKey.DOCUMENTS);
    } else if (pathname.startsWith('/statistic')) {
      setActiveNavKey(ENavKey.STATISTIC);
    } else if (pathname.startsWith('/time-record')) {
      setActiveNavKey(ENavKey.TIME_RECORD);
    }
  }, [location]);

  return (
    <div
      data-tauri-drag-region
      style={style}
      className={classnames(styles.titleBar, className)}
    >
      <motion.div className={styles.nav}>
        {
          configs.map((config) => {
            const { key, title, path } = config;
            const isActive = activeNavKey === key;
            return (
              <motion.div
                key={key}
                className={classnames(styles.item, { [styles.active]: isActive })}
                onClick={() => {
                  navigate(path);
                }}
              >
                {title}
                {
                  isActive && <motion.div layoutId={'line'} className={styles.line}></motion.div>
                }
              </motion.div>
            )
          })
        }
      </motion.div>
      <WindowControl className={styles.windowControl} />
    </div>
  )
}

export default TitleBar;