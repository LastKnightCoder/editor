import { useRef } from 'react';
import classnames from 'classnames';

import styles from './index.module.less';

const Highlight: React.FC<React.PropsWithChildren> = (props) => {
  const ref = useRef<HTMLSpanElement>(null);

  const handleOnClick = () => {
    console.log(ref.current?.getBoundingClientRect());
  }

  return (
    <span
      className={classnames(styles.highlight, styles.blue)}
      ref={ref}
      onClick={handleOnClick}
      {...props}
    >
      {props.children}
    </span>
  )
}

export default Highlight;
