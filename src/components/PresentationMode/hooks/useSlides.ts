import { useMemoizedFn } from "ahooks";
import { useState, useEffect } from "react";
import { Descendant } from "slate";

// 幻灯片处理hook
const useSlides = (content: Descendant[]) => {
  const [slides, setSlides] = useState<Descendant[][]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [selectedOverviewSlide, setSelectedOverviewSlide] = useState(0);

  // 初始化幻灯片
  useEffect(() => {
    // 根据 type 为 divide-line 的元素拆分幻灯片
    const dividedSlides: Descendant[][] = [];
    let currentSlideContent: Descendant[] = [];

    content.forEach((node) => {
      if ((node as any).type === "divide-line") {
        if (currentSlideContent.length > 0) {
          dividedSlides.push([...currentSlideContent]);
          currentSlideContent = [];
        }
      } else {
        currentSlideContent.push(node);
      }
    });

    // 添加最后一个幻灯片
    if (currentSlideContent.length > 0) {
      dividedSlides.push(currentSlideContent);
    }

    // 如果没有分割线，则整个内容作为一个幻灯片
    if (dividedSlides.length === 0) {
      dividedSlides.push(content);
    }

    setSlides(dividedSlides);
    setCurrentSlide(0);
    setSelectedOverviewSlide(0);
  }, [content]);

  // 导航到下一张幻灯片
  const nextSlide = useMemoizedFn(() => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide((prev) => prev + 1);
      return true;
    }
    return false;
  });

  // 导航到上一张幻灯片
  const prevSlide = useMemoizedFn(() => {
    if (currentSlide > 0) {
      setCurrentSlide((prev) => prev - 1);
      return true;
    }
    return false;
  });

  // 设置当前幻灯片
  const goToSlide = useMemoizedFn((index: number) => {
    if (index >= 0 && index < slides.length) {
      setCurrentSlide(index);
      return true;
    }
    return false;
  });

  return {
    slides,
    currentSlide,
    selectedOverviewSlide,
    setSelectedOverviewSlide,
    nextSlide,
    prevSlide,
    goToSlide,
  };
};

export default useSlides;
