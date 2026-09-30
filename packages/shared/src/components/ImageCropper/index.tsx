import React, { useEffect, useRef, useState } from "react";
import {
  MdRotateLeft,
  MdRotateRight,
  MdFlip,
  MdRefresh,
  MdZoomIn,
  MdZoomOut,
} from "react-icons/md";
import "cropperjs";
import { Button, Checkbox, Dialog, IconButton, Select, Tooltip } from "@tau/ui";
import type { ImageCropperProps, AspectRatioPreset, CropperTransform } from "./types";
import type {
  CropperCanvasElement,
  CropperImageElement,
  CropperSelectionElement,
  CropperGridElement,
  CropperCrosshairElement,
  CropperShadeElement,
} from "./cropper-types";

const ImageCropper: React.FC<ImageCropperProps> = ({
  open,
  onCancel,
  imageUrl,
  initialTransform,
  onConfirm,
  alt = "",
}) => {
  // Refs for cropperjs Web Components
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<CropperCanvasElement | null>(null);
  const imageRef = useRef<CropperImageElement | null>(null);
  const selectionRef = useRef<CropperSelectionElement | null>(null);
  const gridRef = useRef<CropperGridElement | null>(null);
  const crosshairRef = useRef<CropperCrosshairElement | null>(null);
  const shadeRef = useRef<CropperShadeElement | null>(null);

  // State
  const [aspectRatio, setAspectRatio] = useState<number | undefined>(
    initialTransform?.selection.aspectRatio
  );
  const [rotation, setRotation] = useState<number>(initialTransform?.rotation || 0);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showCrosshair, setShowCrosshair] = useState<boolean>(false);
  const [selectionSize, setSelectionSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // Aspect ratio presets
  const aspectRatioPresets: AspectRatioPreset[] = [
    { label: "自由", value: undefined },
    { label: "1:1 (正方形)", value: 1 },
    { label: "16:9 (横屏)", value: 16 / 9 },
    { label: "9:16 (竖屏)", value: 9 / 16 },
    { label: "4:3", value: 4 / 3 },
    { label: "3:2", value: 3 / 2 },
    { label: "21:9 (超宽)", value: 21 / 9 },
  ];

  const aspectRatioOptions = aspectRatioPresets.map(preset => ({
    label: preset.label,
    value: preset.value === undefined ? "free" : preset.value,
  }));

  // Initialize cropperjs Web Components
  useEffect(() => {
    if (!open || !canvasContainerRef.current) return;

    // Create elements
    const canvas = document.createElement("cropper-canvas") as CropperCanvasElement;
    canvas.setAttribute("background", "true");
    // cropperjs 把它写进 :host 的 --theme-color，var() 在宿主上下文解析，随主题切换
    canvas.setAttribute("theme-color", "var(--tau-accent)");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";

    const image = document.createElement("cropper-image") as CropperImageElement;
    image.setAttribute("src", imageUrl);
    image.setAttribute("alt", alt);
    image.setAttribute("rotatable", "true");
    image.setAttribute("scalable", "true");
    image.setAttribute("translatable", "true");
    image.setAttribute("crossorigin", "anonymous");
    image.setAttribute("initial-center-size", "contain"); // 图片初始居中显示

    const shade = document.createElement("cropper-shade") as CropperShadeElement;

    const selection = document.createElement("cropper-selection") as CropperSelectionElement;
    selection.setAttribute("initial-coverage", "0.95"); // 增大裁剪区域
    selection.setAttribute("movable", "true");
    selection.setAttribute("resizable", "true");
    selection.setAttribute("zoomable", "true");
    selection.setAttribute("keyboard", "true");
    selection.setAttribute("outlined", "true");

    // Add grid
    const grid = document.createElement("cropper-grid") as CropperGridElement;
    grid.setAttribute("rows", "3");
    grid.setAttribute("columns", "3");
    grid.setAttribute("covered", "true");
    if (!showGrid) {
      grid.setAttribute("hidden", "true");
    }

    // Add crosshair
    const crosshair = document.createElement("cropper-crosshair") as CropperCrosshairElement;
    crosshair.setAttribute("centered", "true");
    if (!showCrosshair) {
      crosshair.setAttribute("hidden", "true");
    }

    // Assemble DOM structure - order matters!
    // 1. Add grid first
    selection.appendChild(grid);
    // 2. Add crosshair
    selection.appendChild(crosshair);

    // 3. Add handles - move handle MUST be first
    const moveHandle = document.createElement("cropper-handle");
    moveHandle.setAttribute("action", "move");
    moveHandle.setAttribute("plain", "true");
    selection.appendChild(moveHandle);

    // 4. Add resize handles
    const handleActions = [
      "n-resize",
      "e-resize",
      "s-resize",
      "w-resize",
      "ne-resize",
      "nw-resize",
      "se-resize",
      "sw-resize",
    ];
    handleActions.forEach(action => {
      const handle = document.createElement("cropper-handle");
      handle.setAttribute("action", action);
      selection.appendChild(handle);
    });
    // Add canvas-level handle for select action (官方示例中有)
    const canvasHandle = document.createElement("cropper-handle");
    canvasHandle.setAttribute("action", "select");
    canvasHandle.setAttribute("plain", "true");

    canvas.appendChild(image);
    canvas.appendChild(shade);
    canvas.appendChild(canvasHandle);
    canvas.appendChild(selection);

    // Save refs
    canvasRef.current = canvas;
    imageRef.current = image;
    selectionRef.current = selection;
    gridRef.current = grid;
    crosshairRef.current = crosshair;
    shadeRef.current = shade;

    // Restore initial transform if provided
    const restoreTransform = () => {
      if (!initialTransform) return;

      // Restore image transform first
      if (initialTransform.transform) {
        const t = initialTransform.transform;
        image.$setTransform?.({
          a: t.a,
          b: t.b,
          c: t.c,
          d: t.d,
          e: t.e,
          f: t.f,
        });
      }

      // Restore selection using $change method
      if (initialTransform.selection) {
        const sel = initialTransform.selection;
        if (sel.aspectRatio) {
          selection.setAttribute("aspect-ratio", String(sel.aspectRatio));
        }
        // Use setTimeout to ensure DOM is ready
        setTimeout(() => {
          selection.$change?.(sel.x, sel.y, sel.width, sel.height);
        }, 100);
      }
    };

    if (initialTransform) {
      // Use setTimeout since cropperjs image doesn't fire standard load event
      setTimeout(restoreTransform, 300);
    }

    // Listen to selection change to update size display
    const handleSelectionChange = () => {
      const w = parseFloat(selection.getAttribute("width") || "0");
      const h = parseFloat(selection.getAttribute("height") || "0");
      setSelectionSize({ width: Math.round(w), height: Math.round(h) });
    };

    selection.addEventListener("change", handleSelectionChange);

    // Mount to DOM
    canvasContainerRef.current.appendChild(canvas);

    return () => {
      selection.removeEventListener("change", handleSelectionChange);
      canvas.remove();
      canvasRef.current = null;
      imageRef.current = null;
      selectionRef.current = null;
      gridRef.current = null;
      crosshairRef.current = null;
      shadeRef.current = null;
    };
  }, [open, imageUrl, alt, initialTransform]);

  // Handle grid visibility separately to avoid re-creating cropper
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    if (showGrid) {
      grid.removeAttribute("hidden");
    } else {
      grid.setAttribute("hidden", "true");
    }
  }, [showGrid]);

  // Handle crosshair visibility separately
  useEffect(() => {
    const crosshair = crosshairRef.current;
    if (!crosshair) return;
    if (showCrosshair) {
      crosshair.removeAttribute("hidden");
    } else {
      crosshair.setAttribute("hidden", "true");
    }
  }, [showCrosshair]);

  // Handle aspect ratio change
  const handleAspectRatioChange = (value: string | number | undefined) => {
    const numValue = value === "free" ? undefined : (value as number);
    setAspectRatio(numValue);
    const selection = selectionRef.current;
    if (!selection) return;

    if (numValue !== undefined) {
      selection.setAttribute("aspect-ratio", String(numValue));
    } else {
      selection.removeAttribute("aspect-ratio");
    }
  };

  // Handle rotation
  const handleRotate = (degrees: number) => {
    const image = imageRef.current;
    if (!image || !image.$rotate) return;

    const newRotation = rotation + degrees;
    setRotation(newRotation);
    // cropperjs $rotate 接收弧度，需要转换
    const radians = (degrees * Math.PI) / 180;
    image.$rotate(radians);
  };

  // Handle zoom - 使用按钮式增量缩放，与官方示例一致
  const handleZoomIn = () => {
    const image = imageRef.current;
    if (!image || !image.$zoom) return;
    image.$zoom(0.1);
  };

  const handleZoomOut = () => {
    const image = imageRef.current;
    if (!image || !image.$zoom) return;
    image.$zoom(-0.1);
  };

  // Handle flip
  const handleFlip = (direction: "horizontal" | "vertical") => {
    const image = imageRef.current;
    if (!image || !image.$scale) return;

    if (direction === "horizontal") {
      image.$scale(-1, 1);
    } else {
      image.$scale(1, -1);
    }
  };

  // Handle grid toggle
  const handleGridToggle = (checked: boolean) => {
    setShowGrid(checked);
    const grid = gridRef.current;
    if (!grid) return;

    if (checked) {
      grid.removeAttribute("hidden");
    } else {
      grid.setAttribute("hidden", "true");
    }
  };

  // Handle crosshair toggle
  const handleCrosshairToggle = (checked: boolean) => {
    setShowCrosshair(checked);
    const crosshair = crosshairRef.current;
    if (!crosshair) return;

    if (checked) {
      crosshair.removeAttribute("hidden");
    } else {
      crosshair.setAttribute("hidden", "true");
    }
  };

  // Handle reset
  const handleReset = () => {
    const image = imageRef.current;
    const selection = selectionRef.current;
    if (!image || !selection) return;

    // Reset image transform
    image.$resetTransform?.();
    image.$center?.("contain");

    // Reset selection
    selection.$reset?.();

    // Reset state
    setRotation(0);
    setAspectRatio(undefined);
    selection.removeAttribute("aspect-ratio");
  };

  // Handle confirm
  const handleConfirm = async () => {
    const selection = selectionRef.current;
    const image = imageRef.current;

    if (!selection || !image) {
      setError("裁剪器未初始化");
      return;
    }

    setConfirmLoading(true);
    setError("");
    try {
      // Get selection parameters
      const x = parseFloat(selection.getAttribute("x") || "0");
      const y = parseFloat(selection.getAttribute("y") || "0");
      const width = parseFloat(selection.getAttribute("width") || "0");
      const height = parseFloat(selection.getAttribute("height") || "0");
      const aspectRatioValue =
        parseFloat(selection.getAttribute("aspect-ratio") || "0") || undefined;

      // Get image transform - $getTransform returns array [a, b, c, d, e, f]
      const matrix = image.$getTransform?.();
      const transform = Array.isArray(matrix)
        ? {
            a: matrix[0],
            b: matrix[1],
            c: matrix[2],
            d: matrix[3],
            e: matrix[4],
            f: matrix[5],
          }
        : undefined;

      // Build CropperTransform object
      const cropTransform: CropperTransform = {
        selection: {
          x,
          y,
          width,
          height,
          aspectRatio: aspectRatioValue,
        },
        transform,
        rotation,
        version: "1.0",
      };

      // Generate cropped canvas
      const canvas = await selection.$toCanvas?.();
      if (!canvas) {
        setError("生成裁剪图片失败");
        return;
      }

      // Convert to blob
      const blob = await new Promise<Blob | null>(resolve => {
        canvas.toBlob(blob => resolve(blob), "image/jpeg", 0.95);
      });

      if (!blob) {
        setError("生成裁剪图片失败");
        return;
      }

      // Call confirm callback
      await onConfirm(cropTransform, blob);
    } catch (error) {
      console.error("裁剪失败:", error);
      setError("裁剪失败，请重试");
    } finally {
      setConfirmLoading(false);
    }
  };

  const toolButton = (title: string, icon: React.ReactNode, onClick: () => void) => (
    <Tooltip content={title}>
      <IconButton aria-label={title} onClick={onClick} className="[&_svg]:size-[18px]">
        {icon}
      </IconButton>
    </Tooltip>
  );

  const toolGroupLabel = "text-ink-3 text-tau-meta whitespace-nowrap";

  return (
    <Dialog
      open={open}
      onOpenChange={next => !next && onCancel()}
      locked={confirmLoading}
      title="裁剪图片"
      width={1100}
      height={780}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={confirmLoading}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={confirmLoading}
            loadingText="裁剪中…"
            onClick={handleConfirm}
          >
            确定
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 pb-5 pt-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2">
            <span className={toolGroupLabel}>宽高比</span>
            <Select<string | number>
              size="sm"
              className="w-[140px]"
              options={aspectRatioOptions}
              value={aspectRatio === undefined ? "free" : aspectRatio}
              onValueChange={handleAspectRatioChange}
            />
          </div>

          <div className="flex items-center gap-1">
            <span className={`${toolGroupLabel} mr-1`}>旋转</span>
            {toolButton("逆时针旋转 90°", <MdRotateLeft />, () => handleRotate(-90))}
            {toolButton("顺时针旋转 90°", <MdRotateRight />, () => handleRotate(90))}
          </div>

          <div className="flex items-center gap-1">
            <span className={`${toolGroupLabel} mr-1`}>缩放</span>
            {toolButton("缩小", <MdZoomOut />, handleZoomOut)}
            {toolButton("放大", <MdZoomIn />, handleZoomIn)}
          </div>

          <div className="flex items-center gap-1">
            <span className={`${toolGroupLabel} mr-1`}>翻转</span>
            {toolButton("水平翻转", <MdFlip />, () => handleFlip("horizontal"))}
            {toolButton("垂直翻转", <MdFlip className="rotate-90" />, () => handleFlip("vertical"))}
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              checked={showGrid}
              onChange={event => handleGridToggle(event.target.checked)}
              label="网格"
            />
            <Checkbox
              checked={showCrosshair}
              onChange={event => handleCrosshairToggle(event.target.checked)}
              label="十字线"
            />
          </div>

          <div className="ml-auto">{toolButton("重置", <MdRefresh />, handleReset)}</div>
        </div>

        <div className="bg-sunken border-line-1 rounded-tau-md relative min-h-0 flex-1 overflow-hidden border">
          <div ref={canvasContainerRef} className="h-full w-full" />

          {selectionSize && (
            <div className="bg-surface text-ink-2 text-tau-meta shadow-card rounded-tau-sm pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 tabular-nums">
              {selectionSize.width} × {selectionSize.height} px
            </div>
          )}
        </div>

        {error && (
          <p className="bg-danger-soft text-danger rounded-tau-sm px-3 py-2 text-[12.5px]">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
};

export default ImageCropper;
