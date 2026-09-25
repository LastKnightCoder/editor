import React from "react";
import { GeometryElement } from "../../../plugins";
import { geometrySetterManager } from "./GeometrySetterManager";
import { registerGeometrySetters } from "./registerGeometrySetters";

interface GeometrySettersProps {
  element: GeometryElement;
  onChange: (element: GeometryElement) => void;
}

registerGeometrySetters();

/**
 * 几何图形设置器：按当前图形类型收集已注册的设置器，平铺进属性浮动条
 */
const GeometrySetters: React.FC<GeometrySettersProps> = ({ element, onChange }) => {
  const setterComponents = geometrySetterManager.getSettersForElement(element);
  if (setterComponents.length === 0) return null;
  return (
    <>
      {setterComponents.map((SetterComponent, index) => (
        <SetterComponent key={index} element={element} onChange={onChange} />
      ))}
    </>
  );
};

export default GeometrySetters;
