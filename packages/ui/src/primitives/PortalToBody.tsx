import { ReactNode } from "react";
import { createPortal } from "react-dom";

interface PortalToBodyProps {
  children: ReactNode;
  container?: HTMLElement;
}

const PortalToBody = ({ children, container }: PortalToBodyProps) => {
  return createPortal(children, container ?? document.body);
};

export default PortalToBody;
