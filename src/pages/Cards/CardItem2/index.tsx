import classnames from "classnames";
import { Typography, Popover } from 'antd';
import { RiMoreLine } from 'react-icons/ri';
import Tags from "@/components/Tags";
import SettingPanel, { ISettingItem } from "./SettingPanel";

import { getEditorTextValue } from '@/utils';
import { ICard } from "@/types";

import styles from './index.module.less';

const { Paragraph } = Typography;

interface ICardItem2Props {
  card: ICard;
  onClick?: (e: any) => void;
  active?: boolean;
  settings?: ISettingItem[];
}

const CardItem2 = (props: ICardItem2Props) => {
  const { card, onClick, active = false, settings = []} = props;
  const { content, tags } = card;

  return (
    <div className={classnames(styles.itemContainer, { [styles.active]: active })} onClick={onClick}>
      <Tags tags={tags} showIcon className={styles.tags} />
      <Paragraph className={styles.textContainer} ellipsis={{ rows: 2 }}>
        {getEditorTextValue(content)}
      </Paragraph>
      <Popover
        placement="bottomRight"
        trigger="click"
        content={<SettingPanel settings={settings} cardId={card.id} />}
        arrow={false}
      >
        <div className={styles.moreIcon} onClick={e => e.stopPropagation()}>
          <RiMoreLine />
        </div>
      </Popover>
    </div>
  )
}

export default CardItem2;