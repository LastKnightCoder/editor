import { useMatch, useNavigate } from 'react-router-dom';
import classnames from 'classnames';
import For from '@/components/For';
import { FaListUl } from "react-icons/fa6";
import { PiGraphThin } from "react-icons/pi";
import TitlebarV2 from "@/layouts/components/TitlebarV2";
import TitlebarIcon from "@/components/TitlebarIcon";

import styles from './index.module.less';
import React from "react";

interface CardTitlebarProps {
  className?: string;
  style?: React.CSSProperties;
}

const CardTitlebar = (props: CardTitlebarProps) => {
  const { className, style } = props;

  const navigate = useNavigate();

  const tabsConfig = [{
    label: '卡片列表',
    to: '/cards/list',
    icon: <FaListUl />,
    active: useMatch('/cards/list') !== null
  }, {
    label: '关系图谱',
    to: '/cards/link-graph',
    icon: <PiGraphThin />,
    active: useMatch('/cards/link-graph') !== null
  }];

  return (
    <TitlebarV2 className={className} style={style}>
      <div className={styles.nav}>
        <For
          data={tabsConfig}
          renderItem={item => (
            <TitlebarIcon
              key={item.label}
              className={classnames(styles.item)}
              tip={item.label}
              onClick={() => navigate(item.to)}
              active={item.active}
            >
              {item.icon}
            </TitlebarIcon>
          )}
        />
      </div>
    </TitlebarV2>
  )
}

export default CardTitlebar;
