import SVG from 'react-inlinesvg';
import { BiChevronDown } from 'react-icons/bi';

import ColorSelect from "../ColorSelect";

import color from '@/assets/hovering_bar/color.svg';

import styles from './index.module.less';

interface IColorTextProps {
  open: boolean;
  onClick: (event: React.MouseEvent, color: string) => void;
}

const ColorText = (props: IColorTextProps) => {
  const { open, onClick } = props;

  return (
    <div className={styles.textContainer}>
      <div className={styles.text}>
        <SVG src={color} style={{ fill: 'currentcolor', width: 16, height: 16 }} />
        <BiChevronDown />
      </div>
      <ColorSelect
        open={open}
        onClick={(event, color) => {
          onClick(event, color);
        }}
      />
    </div>
  )
}

export default ColorText;