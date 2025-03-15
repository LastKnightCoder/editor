import React from "react";
import { GeometryElement } from "../../../plugins";
import { geometrySetterManager } from "./GeometrySetterManager";
import styles from "./index.module.less";
import { registerGeometrySetters } from "./registerGeometrySetters";

interface GeometrySettersProps {
  element: GeometryElement;
  onChange: (element: GeometryElement) => void;
}

registerGeometrySetters();

/**
 * 几何图形设置器组件
 * 根据当前选中的几何图形类型，显示对应的设置器
 */
const GeometrySetters: React.FC<GeometrySettersProps> = ({
  element,
  onChange,
}) => {
  // 获取适用于当前几何图形的所有设置器组件
  const setterComponents = geometrySetterManager.getSettersForElement(element);

  // 如果没有可用的设置器，则不显示
  if (setterComponents.length === 0) {
    return null;
  }

  return (
    <div
      className={styles.container}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
      }}
    >
      {setterComponents.map((SetterComponent, index) => (
        <SetterComponent key={index} element={element} onChange={onChange} />
      ))}
    </div>
  );
};

export default GeometrySetters;
