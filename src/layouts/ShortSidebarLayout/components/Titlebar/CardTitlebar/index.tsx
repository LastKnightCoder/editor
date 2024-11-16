import { useMatch, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import classnames from 'classnames';
import For from '@/components/For';

import styles from './index.module.less';
import { FileMarkdownOutlined } from "@ant-design/icons";
import TitlebarIcon from "@/components/TitlebarIcon";
import useCardPanelStore, { EActiveSide } from "@/stores/useCardPanelStore.ts";

const CardTitlebar = () => {
  const navigate = useNavigate();

  const tabsConfig = [{
    label: '卡片列表',
    to: '/cards/list',
    active: useMatch('/cards/list') !== null
  }, {
    label: '关系图谱',
    to: '/cards/link-graph',
    active: useMatch('/cards/link-graph') !== null
  }];

  const {
    leftActiveId,
    rightActiveId,
    activeSide,
  } = useCardPanelStore(state => ({
    leftActiveId: state.leftActiveCardId,
    rightActiveId: state.rightActiveCardId,
    activeSide: state.activeSide,
  }));

  const activeId = activeSide === EActiveSide.Left ? leftActiveId : rightActiveId;

  return (
    <div className={styles.nav}>
      <For
        data={tabsConfig}
        renderItem={item => (
          <motion.div
            key={item.label}
            className={classnames(styles.item, { [styles.active]: item.active })}
            onClick={() => navigate(item.to)}
          >
            {item.label}
            {
              item.active && <motion.div layoutId='nav-line' className={styles.line} />
            }
          </motion.div>
        )}
      />
      <TitlebarIcon tip={'导出 Markdown'} onClick={() => {
        if (!activeId) return;
        const event = new CustomEvent('export-card-to-markdown', {
          detail: activeId,
        });
        document.dispatchEvent(event);
      }}>
        <FileMarkdownOutlined />
      </TitlebarIcon>
    </div>
  )
}

export default CardTitlebar;
