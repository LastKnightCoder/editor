import SVG from 'react-inlinesvg';
import { BiChevronDown } from 'react-icons/bi';
import HighlightSelect from "../HighlightSelect";

import highlight from '@/assets/hovering_bar/highlight.svg';

import styles from './index.module.less';

interface IHighlightTextProps {
  open: boolean;
  onClick: (event: React.MouseEvent, label: string | undefined) => void;
}

const HighlightText = (props: IHighlightTextProps) => {
  const { open, onClick } = props;

  return (
    <div className={styles.textContainer}>
      <div className={styles.text}>
        <SVG src={highlight} style={{ fill: 'currentcolor', width: 16, height: 16 }} />
        <BiChevronDown />
      </div>
      <HighlightSelect
        open={open}
        onClick={(event, label) => {
          onClick(event, label);
        }}
      />
    </div>
  )
}

export default HighlightText;