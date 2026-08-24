import { useEffect, useRef } from "react";
import { RotateCcw } from "lucide-react";

interface SignaturePadProps {
  onChange: (data?: string) => void;
}

export function SignaturePad({ onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const bounds = canvas.getBoundingClientRect();
    canvas.width = bounds.width * ratio;
    canvas.height = bounds.height * ratio;
    const context = canvas.getContext("2d");
    context?.scale(ratio, ratio);
    if (context) {
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 2.5;
      context.strokeStyle = "#0f172a";
    }
  }, []);

  const position = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = event.currentTarget.getContext("2d");
    const point = position(event);
    context?.beginPath();
    context?.moveTo(point.x, point.y);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const point = position(event);
    const context = event.currentTarget.getContext("2d");
    context?.lineTo(point.x, point.y);
    context?.stroke();
  };

  const end = () => {
    if (!drawing.current || !canvasRef.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    onChange(undefined);
  };

  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} className="h-36 w-full touch-none" aria-label="Zone de signature" /><button type="button" onClick={clear} className="flex w-full items-center justify-center gap-2 border-t border-slate-100 py-2 text-xs font-semibold text-slate-600"><RotateCcw className="h-3.5 w-3.5" />Effacer la signature</button></div>;
}
