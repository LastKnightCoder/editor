import { useState } from 'react';
import { Typography, Popover } from 'antd';
import { MdMoreVert } from 'react-icons/md';
import Tags from "@/components/Tags";
import If from "@/components/If";
import SettingPanel, { ISettingItem } from "./SettingPanel";

import classnames from "classnames";
import { getEditorTextValue } from '@/utils';
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
}

const CardItem2 = (props: ICardItem2Props) => {
  const {
    card,
    onClick,
    showTags = false,
    active = false,
    settings = [],
    maxRows = 2,
    showLine = true,
  } = props;

  const { content, tags } = card;

  const [settingPanelOpen, setSettingPanelOpen] = useState(false);

  return (
    <div className={classnames(styles.itemContainer, { [styles.active]: active, [styles.showLine]: showLine })} onClick={onClick}>
      <If condition={showTags}>
        <Tags tags={tags} showIcon className={styles.tags} />
      </If>
      <Paragraph className={styles.textContainer} ellipsis={{ rows: maxRows }}>
        {getEditorTextValue(content) || '未知内容'}
      </Paragraph>
      <If condition={settings.length > 0}>
        <Popover
          open={settingPanelOpen}
          onOpenChange={setSettingPanelOpen}
          placement="bottomRight"
          trigger="click"
          content={<SettingPanel closePanel={() => { setSettingPanelOpen(false) }} settings={settings} cardId={card.id} />}
          arrow={false}
        >
          <div className={styles.moreIcon} onClick={e => e.stopPropagation()}>
            <MdMoreVert />
          </div>
        </Popover>
      </If>
    </div>
  )
}

export default CardItem2;