import React, { useState } from 'react';
import classnames from "classnames";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CaretDownOutlined } from '@ant-design/icons';

import WindowControl from "@/components/WindowControl";

import styles from './index.module.less';
import {Popover} from "antd";

interface ITitleBarProps {
  className?: string;
  style?: React.CSSProperties;
}

enum ENavKey {
  CARDS = 'CARDS',
  ARTICLES = 'ARTICLES',
  DAILY = 'DAILY',
}

const TitleBar = (props: ITitleBarProps) => {
  const { className, style } = props;
  const [activeNavKey, setActiveNavKey] = useState<ENavKey>(ENavKey.CARDS);
  const [cardPopoverOpen, setCardPopoverOpen] = useState<boolean>(false);
  const navigate = useNavigate();

  const navigateToDaily = () => {
    setActiveNavKey(ENavKey.DAILY);
    navigate('/daily');
  }

  const navigateToArticles = () => {
    setActiveNavKey(ENavKey.ARTICLES);
    navigate('/articles/list');
  }

  const isCardsActive = activeNavKey === ENavKey.CARDS;
  const isArticlesActive = activeNavKey === ENavKey.ARTICLES;
  const isDailyActive = activeNavKey === ENavKey.DAILY;

  return (
    <div
      data-tauri-drag-region
      style={style}
      className={classnames(styles.titleBar, className)}
    >
      <motion.div className={styles.nav}>
        <Popover
          open={cardPopoverOpen}
          onOpenChange={setCardPopoverOpen}
          trigger={'click'}
          placement={'bottom'}
          overlayInnerStyle={{
            padding: 4,
          }}
          content={
            <div className={styles.dropCard}>
              <div
                className={styles.childItem}
                onClick={() => {
                  setActiveNavKey(ENavKey.CARDS);
                  setCardPopoverOpen(false);
                  navigate('/cards/list')
                }}
              >
                卡片列表
              </div>
              <div
                className={styles.childItem}
                onClick={() => {
                  setActiveNavKey(ENavKey.CARDS);
                  setCardPopoverOpen(false);
                  navigate('/cards/link-graph')
                }}>
                关系图谱
              </div>
            </div>
          }
        >
          <motion.div
            className={classnames(styles.item, { [styles.active]: isCardsActive })}
          >
            卡片 <CaretDownOutlined />
            {
              isCardsActive && <motion.div layoutId={'line'} className={styles.line}></motion.div>
            }
          </motion.div>
        </Popover>
        <motion.div
          className={classnames(styles.item, { [styles.active]: isArticlesActive })}
          onClick={navigateToArticles}
        >
          文章
          {
            isArticlesActive && <motion.div layoutId={'line'} className={styles.line}></motion.div>
          }
        </motion.div>
        <motion.div
          className={classnames(styles.item, { [styles.active]: isDailyActive })}
          onClick={navigateToDaily}
        >
          日记
          {
            isDailyActive && <motion.div layoutId={'line'} className={styles.line}></motion.div>
          }
        </motion.div>
      </motion.div>
      <WindowControl className={styles.windowControl} />
    </div>
  )
}

export default TitleBar;