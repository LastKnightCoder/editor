import classnames from "classnames";
import For from "@/components/For";

import styles from './index.module.less';

interface ColorSelectProps {
  selectColor: (color: string) => void;
  color: string;
}

const colors = [{
  label: 'yellow',
  color: 'rgb(255, 212, 0)',
}, {
  label: 'green',
  color: 'rgb(42, 157, 143)',
}, {
  label: 'blue',
  color: 'rgb(162, 210, 255)',
}, {
  label: 'purple',
  color: 'rgb(94, 84, 142)',
}, {
  label: 'red',
  color: 'rgb(239, 35, 60)',
}];

const ColorSelect = (props: ColorSelectProps) => {
  const { selectColor, color: activeColor } = props;

  return (
    <div className={styles.container}>
      <For
        data={colors}
        renderItem={({ label, color }) => (
          <div
            key={label}
            className={classnames(styles.item, {
              [styles.active]: label === activeColor,
            })}
            onClick={(e) =>{
              e.preventDefault();
              e.stopPropagation();
              selectColor(label)
            }}
            style={{
              backgroundColor: color,
            }}
          />
        )}
      />
    </div>
  )
}

export default ColorSelect;