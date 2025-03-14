import React, { memo } from "react";

interface IIfProps {
  condition: boolean;
}

const If: React.FC<React.PropsWithChildren<IIfProps>> = memo(
  ({ condition, children }) => {
    if (condition) {
      return <>{children}</>;
    }
    return null;
  },
);

export default If;
