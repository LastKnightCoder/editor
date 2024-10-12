import React from 'react';
import { useLocation, useNavigate, useMatch } from 'react-router-dom';
import classnames from 'classnames';
import IconText from '@/components/IconText';
import For from '@/components/For';

import card from '@/assets/icons/card.svg';
import article from '@/assets/icons/article.svg';
import document from '@/assets/icons/documents.svg';
import daily from '@/assets/icons/daily.svg';
import timeRecord from '@/assets/icons/time-record.svg';
import whiteBoard from '@/assets/icons/white-board.svg';
import pdf from '@/assets/icons/pdf.svg';

import styles from './index.module.less';

interface SidebarProps {
  className?: string;
  style?: React.CSSProperties;
}

const Sidebar = (props: SidebarProps) => {
  const { className, style } = props;

  const configs = [{
    key: 'whiteBoard',
    icon: whiteBoard,
    desc: '白板',
    path: '/white-boards',
    active: useMatch('/white-boards') !== null
  }, {
    key: 'project',
    icon: document,
    desc: '项目',
    path: '/projects/list',
    active: useMatch('/projects') !== null
  }, {
    key: 'card',
    icon: card,
    desc: '卡片',
    path: '/cards/list',
    active: useMatch('/cards/*') !== null
  }, {
    key: 'article',
    icon: article,
    desc: '文章',
    path: '/articles',
    active: useMatch('/articles') !== null
  }, {
    key: 'document',
    icon: document,
    desc: '文档',
    path: '/documents',
    active: useMatch('/documents') !== null
  }, {
    key: 'pdf',
    icon: pdf,
    desc: 'PDF',
    path: '/pdfs',
    active: useMatch('/pdfs') !== null
  }, {
    key: 'daily',
    icon: daily,
    desc:'日报',
    path: '/dailies',
    active: useMatch('/dailies') !== null
    }, {
    key: 'timeRecord',
    icon: timeRecord,
    desc: '时间统计',
    path: '/time-records',
    active: useMatch('/time-records') !== null
  },]

  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className={classnames(styles.sidebar, className)} style={style}>
      <div className={styles.list}>
        <For 
          data={configs} 
          renderItem={item => (
            <IconText
              key={item.key}
              icon={item.icon}
              text={item.desc}
              active={item.active}
              onClick={() => navigate(item.path)}
            />
          )}
        />
      </div>
      <div className={styles.setting}>
          <IconText
            icon={document}
            text={'设置'}
          />
      </div>
    </div>
  )
}

export default Sidebar;