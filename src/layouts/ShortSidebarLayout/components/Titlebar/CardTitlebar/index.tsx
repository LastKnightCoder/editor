import { useMatch, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import classnames from 'classnames';
import For from '@/components/For';

import styles from './index.module.less';

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
    </div>
  )
}

export default CardTitlebar;