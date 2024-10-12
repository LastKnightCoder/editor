import { memo } from 'react';
import classnames from 'classnames';
import { Typography } from 'antd';

import Tags from "@/components/Tags";

import { getEditorTextValue } from "@/utils";

import { DailyNote } from "@/types/daily_note";

import styles from './index.module.less';

interface IDailyItemProps {
  dailyNote: DailyNote;
  active?: boolean;
  onClick?: () => void;
}

const { Paragraph } = Typography;

const DailyItem = memo((props: IDailyItemProps) => {
  const { dailyNote, active, onClick } = props;

  return (
    <div className={classnames(styles.itemContainer, { [styles.active]: active })} onClick={onClick}>
      <div className={styles.content}>
        <Paragraph ellipsis={{ rows: 2 }}>
          {getEditorTextValue(dailyNote.content)}
        </Paragraph>
      </div>
      <div className={styles.time}>
        <Tags tags={[dailyNote.date]} showIcon={false} tagStyle={active ? { backgroundColor: 'var(--active-icon-bg)' } : {}} />
      </div>
    </div>
  )
});

export default DailyItem;