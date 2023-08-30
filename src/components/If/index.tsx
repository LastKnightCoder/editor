import React from 'react';

interface IIfProps {
  condition: boolean;
}

const If: React.FC<React.PropsWithChildren<IIfProps>> = ({ condition, children }) => {
  if (condition) {
    return <>{children}</>
  }
  return null;
}

export default If;