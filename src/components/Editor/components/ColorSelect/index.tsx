import classnames from "classnames";
import For from "@/components/For";
import SVG from 'react-inlinesvg';
import useTheme from "@/hooks/useTheme.ts";

import checkIcon from '@/assets/icons/check.svg';

import styles from './index.module.less';

interface ColorSelectProps<ColorType extends string> {
  colors: Array<{
    label: ColorType;
    color: string;
  }>
  selectColor: string;
  onSelectColor: (color: ColorType) => void;
}

const ColorSelect = <ColorType extends string,>(props: ColorSelectProps<ColorType>) => {
  const { selectColor, onSelectColor, colors } = props;

  const { isDark } = useTheme();

  return (
    <div className={styles.container}>
      <For
        data={colors}
        renderItem={({ label, color }) => (
          <div
            key={label}
            className={classnames(styles.item, {
              [styles.active]: label === selectColor,
            })}
            onClick={(e) =>{
              e.preventDefault();
              e.stopPropagation();
              onSelectColor(label)
            }}
            style={{
              backgroundColor: color,
            }}
          >
            {
              label === selectColor && (
                <SVG src={checkIcon} className={styles.checkIcon} style={{ fill: isDark ? '#fff' : 'gray' }} />
              )
            }
          </div>
        )}
      />
    </div>
  )
}

export default ColorSelect;