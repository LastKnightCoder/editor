import React, { useRef } from 'react'

const Paragraph: React.FC<React.PropsWithChildren> = (props) => {
  const { children } = props;
  
  const ref = useRef<HTMLParagraphElement>(null);

  return (
    <p ref={ref}>
      {children}
    </p>
  )
}

export default Paragraph;