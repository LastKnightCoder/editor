import { memo, useRef, useState, useCallback } from "react";
import { useSlateStatic } from "slate-react";
import { AnimatePresence, motion } from "framer-motion";
import Item from "../Item";
import useBlockPanelStore from "../../../stores/useBlockPanelStore.ts";
import styles from "./index.module.less";

const List = memo(() => {
  const editor = useSlateStatic();
  const {
    list,
    submenuList,
    activeIndex,
    inSubmenu,
    selectItem,
    enterSubmenu,
    exitSubmenu,
  } = useBlockPanelStore((state) => ({
    list: state.list,
    submenuList: state.submenuList,
    activeIndex: state.activeIndex,
    inSubmenu: state.inSubmenu,
    selectItem: state.selectItem,
    enterSubmenu: state.enterSubmenu,
    exitSubmenu: state.exitSubmenu,
  }));

  const [hoverIndex, setHoverIndex] = useState<number>(-1);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // 判断点是否在三角形内（安全三角区）
  const isPointInTriangle = useCallback(
    (
      px: number,
      py: number,
      ax: number,
      ay: number,
      bx: number,
      by: number,
      cx: number,
      cy: number,
    ) => {
      const v0x = cx - ax;
      const v0y = cy - ay;
      const v1x = bx - ax;
      const v1y = by - ay;
      const v2x = px - ax;
      const v2y = py - ay;

      const dot00 = v0x * v0x + v0y * v0y;
      const dot01 = v0x * v1x + v0y * v1y;
      const dot02 = v0x * v2x + v0y * v2y;
      const dot11 = v1x * v1x + v1y * v1y;
      const dot12 = v1x * v2x + v1y * v2y;

      const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
      const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
      const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

      return u >= 0 && v >= 0 && u + v <= 1;
    },
    [],
  );

  // 处理鼠标移动（用于安全三角区）
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      mousePositionRef.current = { x: e.clientX, y: e.clientY };

      // 如果有子菜单打开，检查是否在安全三角区内
      if (inSubmenu && submenuRef.current) {
        const submenuRect = submenuRef.current.getBoundingClientRect();
        const { x: mouseX, y: mouseY } = mousePositionRef.current;

        // 安全三角区的三个顶点：鼠标位置、子菜单左上角、子菜单左下角
        const inSafeTriangle = isPointInTriangle(
          mouseX,
          mouseY,
          mouseX,
          mouseY,
          submenuRect.left,
          submenuRect.top,
          submenuRect.left,
          submenuRect.bottom,
        );

        // 如果不在安全三角区且不在子菜单内，延迟关闭
        const inSubmenu =
          mouseX >= submenuRect.left &&
          mouseX <= submenuRect.right &&
          mouseY >= submenuRect.top &&
          mouseY <= submenuRect.bottom;

        if (!inSafeTriangle && !inSubmenu && hoverIndex === -1) {
          if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
          }
          hoverTimerRef.current = setTimeout(() => {
            exitSubmenu();
          }, 300);
        }
      }
    },
    [inSubmenu, hoverIndex, isPointInTriangle, exitSubmenu],
  );

  // 处理菜单项 hover
  const handleItemMouseEnter = useCallback(
    (index: number) => {
      setHoverIndex(index);

      // 清除之前的定时器
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }

      const item = list[index];
      if (item?.children && item.children.length > 0) {
        // 如果已经在子菜单中，立即切换
        if (inSubmenu) {
          enterSubmenu(index);
        } else {
          // 否则延迟展开
          hoverTimerRef.current = setTimeout(() => {
            enterSubmenu(index);
          }, 200);
        }
      } else if (inSubmenu) {
        // 如果 hover 到没有子菜单的项，延迟关闭子菜单
        hoverTimerRef.current = setTimeout(() => {
          exitSubmenu();
        }, 300);
      }
    },
    [list, inSubmenu, enterSubmenu, exitSubmenu],
  );

  // 处理菜单项 hover 离开
  const handleItemMouseLeave = useCallback(() => {
    setHoverIndex(-1);
  }, []);

  if (list.length === 0) return null;

  return (
    <div className="flex" onMouseMove={handleMouseMove}>
      {/* 主菜单 */}
      <div
        className={`${styles.selectDropdownScroll} overflow-y-auto py-2 border-10 border-transparent`}
        style={{ maxHeight: "300px", minWidth: "200px" }}
      >
        {list.map((item, index) => (
          <div
            key={index}
            onMouseEnter={() => handleItemMouseEnter(index)}
            onMouseLeave={handleItemMouseLeave}
          >
            <Item
              item={item}
              active={!inSubmenu && index === activeIndex}
              onClick={() => {
                if (item.children && item.children.length > 0) {
                  enterSubmenu(index);
                } else {
                  selectItem(editor, index);
                }
              }}
            />
          </div>
        ))}
      </div>

      {/* 子菜单 */}
      <AnimatePresence>
        {inSubmenu && submenuList.length > 0 && (
          <motion.div
            ref={submenuRef}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
            className="border-l border-white/20 dark:border-white/10"
          >
            <div
              className={`${styles.selectDropdownScroll} overflow-y-auto py-2 border-10 border-transparent`}
              style={{ maxHeight: "300px", minWidth: "200px" }}
            >
              {submenuList.map((item, index) => (
                <Item
                  key={index}
                  item={item}
                  active={index === activeIndex}
                  onClick={() => {
                    selectItem(editor, index);
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default List;
