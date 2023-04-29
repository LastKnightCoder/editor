import { useRef } from 'react';
import classnames from 'classnames';

import { focusStart } from '../../utils/range';

import styles from './index.module.less';


const Highlight: React.FC<React.PropsWithChildren> = (props) => {
  const ref = useRef<HTMLSpanElement>(null);

  const handleChange = (event: React.FormEvent<HTMLSpanElement>) => {
    console.log(event.currentTarget.textContent);
  }


  const handleOnClick = () => {
    if (!ref.current) return;
    focusStart(ref.current);
  }

  return (
    <span
      className={classnames(styles.highlight, styles.blue)}
      ref={ref}
      onInput={handleChange}
      onClick={handleOnClick}
      contentEditable 
      suppressContentEditableWarning
    >
      {props.children}
    </span>
  )
}

export default Highlight;
