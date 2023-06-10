import React from 'react'
import styles from './index.module.less';

const Paragraph: React.FC<React.PropsWithChildren> = (props) => {
  const { children } = props;

  return (
    <p className={styles.paragraph}>
      {children}
    </p>
  )
}

export default Paragraph;
