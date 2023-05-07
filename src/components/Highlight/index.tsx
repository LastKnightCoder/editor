import classnames from 'classnames';
import styles from './index.module.less';

interface IHighlightProps {
  type?: 'blue' | 'yellow' | 'green' | 'red' | 'purple';
}

const Highlight: React.FC<React.PropsWithChildren<IHighlightProps>> = (props) => {
  const { type = 'yellow' } = props;
  return (
    <span
      className={classnames(styles.highlight, styles[type])}
      {...props}
    >
      {props.children}
    </span>
  )
}

export default Highlight;
