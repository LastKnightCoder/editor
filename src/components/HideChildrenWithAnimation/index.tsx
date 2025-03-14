import classnames from "classnames";

import styles from "./index.module.less";

interface IHideHideChildrenWithAnimationProps {
  open: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const HideChildrenWithAnimation = (
  props: IHideHideChildrenWithAnimationProps,
) => {
  const { open, children, className, style } = props;

  return (
    <div
      className={classnames(
        styles.container,
        { [styles.hide]: !open },
        className,
      )}
      style={style}
    >
      <div className={styles.children}>{children}</div>
    </div>
  );
};

export default HideChildrenWithAnimation;
