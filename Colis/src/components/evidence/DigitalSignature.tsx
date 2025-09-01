import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  PenTool,
  RotateCcw,
  Check,
  X,
  Download,
  User,
  Eraser
} from 'lucide-react';

interface DigitalSignatureProps {
  onSignatureCapture?: (signatureData: string, customerName: string) => void;
  onSignatureClear?: () => void;
  existingSignature?: string;
  customerName?: string;
  disabled?: boolean;
  width?: number;
  height?: number;
}

interface Point {
  x: number;
  y: number;
}

export function DigitalSignature({
  onSignatureCapture,
  onSignatureClear,
  existingSignature,
  customerName: initialCustomerName = '',
  disabled = false,
  width = 400,
  height = 200
}: DigitalSignatureProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [customerName, setCustomerName] = useState(initialCustomerName);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [lastPoint, setLastPoint] = useState<Point | null>(null);

  // Initialize canvas
  const initializeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Configure drawing style
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Clear canvas with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Add border
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    // Reset stroke style for drawing
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
  }, [width, height]);

  // Get mouse/touch coordinates relative to canvas
  const getCoordinates = useCallback((event: MouseEvent | TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in event) {
      // Touch event
      const touch = event.touches[0] || event.changedTouches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY
      };
    } else {
      // Mouse event
      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
      };
    }
  }, []);

  // Start drawing
  const startDrawing = useCallback((event: MouseEvent | TouchEvent) => {
    if (disabled) return;

    event.preventDefault();
    const coords = getCoordinates(event);
    setIsDrawing(true);
    setLastPoint(coords);
    setHasSignature(true);
  }, [disabled, getCoordinates]);

  // Draw line
  const draw = useCallback((event: MouseEvent | TouchEvent) => {
    if (!isDrawing || disabled || !lastPoint) return;

    event.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const coords = getCoordinates(event);

    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    setLastPoint(coords);
  }, [isDrawing, disabled, lastPoint, getCoordinates]);

  // Stop drawing
  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
    setLastPoint(null);
  }, []);

  // Clear signature
  const clearSignature = useCallback(() => {
    initializeCanvas();
    setHasSignature(false);
    onSignatureClear?.();
  }, [initializeCanvas, onSignatureClear]);

  // Capture signature
  const captureSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;

    // Convert canvas to base64 data URL
    const signatureData = canvas.toDataURL('image/png');
    onSignatureCapture?.(signatureData, customerName);
    setShowSignaturePad(false);
  }, [hasSignature, customerName, onSignatureCapture]);

  // Download signature
  const downloadSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;

    const link = document.createElement('a');
    link.download = `signature_${customerName || 'client'}_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [hasSignature, customerName]);

  // Initialize canvas on mount
  useEffect(() => {
    initializeCanvas();
  }, [initializeCanvas]);

  // Add event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Mouse events
    const handleMouseDown = (e: MouseEvent) => startDrawing(e);
    const handleMouseMove = (e: MouseEvent) => draw(e);
    const handleMouseUp = () => stopDrawing();

    // Touch events
    const handleTouchStart = (e: TouchEvent) => startDrawing(e);
    const handleTouchMove = (e: TouchEvent) => draw(e);
    const handleTouchEnd = () => stopDrawing();

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);

      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
    };
  }, [startDrawing, draw, stopDrawing]);

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <PenTool className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Signature Client</h3>
        </div>

        {/* Customer name input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground flex items-center gap-2">
            <User className="w-4 h-4" />
            Nom du Client
          </label>
          <Input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Saisir le nom du client"
            disabled={disabled}
            className="max-w-md"
          />
        </div>

        {/* Existing signature display */}
        {existingSignature && !showSignaturePad && (
          <div className="space-y-3">
            <div className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-900/20">
              <img
                src={existingSignature}
                alt="Signature existante"
                className="max-w-full h-auto"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSignaturePad(true)}
                disabled={disabled}
              >
                <PenTool className="w-4 h-4 mr-2" />
                Modifier
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onSignatureClear}
                disabled={disabled}
                className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/20"
              >
                <X className="w-4 h-4 mr-2" />
                Supprimer
              </Button>
            </div>
          </div>
        )}

        {/* Signature pad */}
        {(!existingSignature || showSignaturePad) && (
          <div className="space-y-3">
            <div className="border rounded-lg overflow-hidden">
              <canvas
                ref={canvasRef}
                className="block w-full cursor-crosshair touch-none"
                style={{ 
                  maxWidth: '100%', 
                  height: 'auto',
                  aspectRatio: `${width}/${height}`
                }}
              />
            </div>

            <div className="text-xs text-muted-foreground text-center">
              Signez dans la zone ci-dessus avec votre doigt ou stylet
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={captureSignature}
                disabled={!hasSignature || disabled || !customerName.trim()}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Check className="w-4 h-4 mr-2" />
                Confirmer
              </Button>
              
              <Button
                variant="outline"
                onClick={clearSignature}
                disabled={!hasSignature || disabled}
              >
                <Eraser className="w-4 h-4 mr-2" />
                Effacer
              </Button>

              <Button
                variant="outline"
                onClick={downloadSignature}
                disabled={!hasSignature || disabled}
                size="sm"
              >
                <Download className="w-4 h-4 mr-2" />
                Télécharger
              </Button>

              {showSignaturePad && (
                <Button
                  variant="outline"
                  onClick={() => setShowSignaturePad(false)}
                  disabled={disabled}
                >
                  <X className="w-4 h-4 mr-2" />
                  Annuler
                </Button>
              )}
            </div>

            {!customerName.trim() && (
              <div className="text-sm text-yellow-600 dark:text-yellow-400">
                ⚠️ Veuillez saisir le nom du client avant de confirmer la signature
              </div>
            )}
          </div>
        )}

        {/* Start signature button */}
        {!existingSignature && !showSignaturePad && (
          <Button
            onClick={() => setShowSignaturePad(true)}
            disabled={disabled}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            <PenTool className="w-4 h-4 mr-2" />
            Capturer Signature
          </Button>
        )}
      </div>
    </Card>
  );
}