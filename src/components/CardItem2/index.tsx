import { memo, useState } from 'react';
import { Typography, Popover } from 'antd';
import { MdMoreHoriz } from "react-icons/md";
import Tags from "@/components/Tags";
import If from "@/components/If";
import SettingPanel, { ISettingItem } from "./SettingPanel";

import classnames from "classnames";
import { getEditorText } from '@/utils';
import { formatDate } from "@/utils/time";
import { ICard } from "@/types";

import styles from './index.module.less';

const { Paragraph } = Typography;

interface ICardItem2Props {
  card: ICard;
  onClick?: (e: React.MouseEvent) => void;
  showTags?: boolean;
  active?: boolean;
  settings?: ISettingItem[];
  maxRows?: number;
  showLine?: boolean;
  showTime?: boolean;
}

const CardItem2 = memo((props: ICardItem2Props) => {
  const {
    card,
    onClick,
    showTags = false,
    active = false,
    settings = [],
    maxRows = 2,
    showLine = true,
    showTime = false,
  } = props;

  const { content, tags } = card;

  const showedTags = tags.length === 0 ? ['未分类'] : tags;

  const [settingPanelOpen, setSettingPanelOpen] = useState(false);
  
  return (
    <div className={classnames(styles.itemContainer, { [styles.active]: active, [styles.showLine]: showLine })} onClick={onClick}>
      <If condition={showTags}>
        <Tags
          tags={showedTags}
          showIcon
          className={styles.tags}
          tagStyle={active ? { backgroundColor: 'var(--active-icon-bg)' } : {}}
        />
      </If>
      <If condition={showTime}>
        <div className={styles.time}>
          更新于：{formatDate(card.update_time, true)}
        </div>
      </If>
      <Paragraph className={classnames(styles.textContainer, { [styles.noTag]: !showTags || tags.length < 1 })} ellipsis={{ rows: maxRows }}>
        {getEditorText(content, 40) || '未知内容'}
      </Paragraph>
      <If condition={settings.length > 0}>
        <Popover
          open={settingPanelOpen}
          onOpenChange={setSettingPanelOpen}
          placement="bottomRight"
          trigger="click"
          content={<SettingPanel closePanel={() => { setSettingPanelOpen(false) }} settings={settings} cardId={card.id} />}
          arrow={false}
          overlayInnerStyle={{
            padding: 4,
          }}
        >
          <div className={styles.moreIcon} onClick={e => e.stopPropagation()}>
            <MdMoreHoriz />
          </div>
        </Popover>
      </If>
    </div>
  )
});

export default CardItem2;
