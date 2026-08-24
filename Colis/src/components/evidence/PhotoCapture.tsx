import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFrappePostCall } from 'frappe-react-sdk';
import {
  Camera,
  Upload,
  X,
  Check,
  RotateCcw,
  Image,
  AlertTriangle,
  Loader2
} from 'lucide-react';

interface PhotoCaptureProps {
  colisId: string;
  onPhotoUploaded?: (photoUrl: string) => void;
  onPhotoRemoved?: () => void;
  existingPhotoUrl?: string;
  disabled?: boolean;
  maxSizeBytes?: number;
  quality?: number;
}

interface PhotoUploadResponse {
  success: boolean;
  message: string;
  file_url?: string;
}

export function PhotoCapture({
  colisId,
  onPhotoUploaded,
  onPhotoRemoved,
  existingPhotoUrl,
  disabled = false,
  maxSizeBytes = 5 * 1024 * 1024, // 5MB default
  quality = 0.8
}: PhotoCaptureProps) {
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { call: uploadPhoto } = useFrappePostCall<PhotoUploadResponse>(
    'log.delivery_note_ops.upload_photo_livraison'
  );

  const { call: deletePhoto } = useFrappePostCall<{ success: boolean; message: string }>(
    'log.delivery_note_ops.delete_photo_livraison'
  );

  // Initialize camera stream
  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use rear camera on mobile
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 }
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setShowCamera(true);
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Impossible d\'accéder à la caméra. Veuillez vérifier les permissions.');
    }
  }, []);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  }, []);

  // Capture photo from camera
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to base64 with compression
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    setCapturedPhoto(dataUrl);
    stopCamera();
  }, [quality, stopCamera]);

  // Handle file selection
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > maxSizeBytes) {
      setError(`La taille du fichier dépasse ${Math.round(maxSizeBytes / (1024 * 1024))}MB`);
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Veuillez sélectionner un fichier image valide');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result && typeof e.target.result === 'string') {
        setCapturedPhoto(e.target.result);
        setError(null);
      }
    };
    reader.readAsDataURL(file);
  }, [maxSizeBytes]);

  // Upload photo to backend
  const handlePhotoUpload = useCallback(async () => {
    if (!capturedPhoto || !colisId) return;

    setIsUploading(true);
    setError(null);

    try {
      const filename = `delivery_photo_${colisId}_${Date.now()}.jpg`;
      
      const response = await uploadPhoto({
        colis_id: colisId,
        file_data: capturedPhoto,
        filename: filename
      });

      if (response?.success && response.file_url) {
        onPhotoUploaded?.(response.file_url);
        setCapturedPhoto(null);
      } else {
        throw new Error(response?.message || 'Erreur lors du téléchargement');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors du téléchargement');
    } finally {
      setIsUploading(false);
    }
  }, [capturedPhoto, colisId, uploadPhoto, onPhotoUploaded]);

  // Remove existing photo
  const handlePhotoRemove = useCallback(async () => {
    if (!colisId) return;

    setIsUploading(true);
    try {
      const response = await deletePhoto({ colis_id: colisId });
      if (response?.success) {
        onPhotoRemoved?.();
      } else {
        throw new Error(response?.message || 'Erreur lors de la suppression');
      }
    } catch (err) {
      console.error('Delete error:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    } finally {
      setIsUploading(false);
    }
  }, [colisId, deletePhoto, onPhotoRemoved]);

  // Reset captured photo
  const resetPhoto = useCallback(() => {
    setCapturedPhoto(null);
    setError(null);
  }, []);

  // Cleanup camera stream on unmount
  React.useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Photo de Livraison</h3>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Existing photo display */}
        {existingPhotoUrl && !capturedPhoto && (
          <div className="space-y-3">
            <div className="relative">
              <img
                src={existingPhotoUrl}
                alt="Photo de livraison"
                className="w-full max-w-sm rounded-lg border shadow-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePhotoRemove}
                disabled={disabled || isUploading}
                className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/20"
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <X className="w-4 h-4 mr-2" />}
                Supprimer
              </Button>
            </div>
          </div>
        )}

        {/* Camera interface */}
        {showCamera && (
          <div className="space-y-3">
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full max-w-sm rounded-lg border"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <div className="flex gap-2">
              <Button onClick={capturePhoto} className="bg-blue-600 hover:bg-blue-700 text-white">
                <Camera className="w-4 h-4 mr-2" />
                Prendre Photo
              </Button>
              <Button variant="outline" onClick={stopCamera}>
                <X className="w-4 h-4 mr-2" />
                Annuler
              </Button>
            </div>
          </div>
        )}

        {/* Captured photo preview */}
        {capturedPhoto && (
          <div className="space-y-3">
            <div className="relative">
              <img
                src={capturedPhoto}
                alt="Photo capturée"
                className="w-full max-w-sm rounded-lg border shadow-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handlePhotoUpload}
                disabled={disabled || isUploading}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                {isUploading ? 'Téléchargement...' : 'Confirmer'}
              </Button>
              <Button variant="outline" onClick={resetPhoto} disabled={isUploading}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reprendre
              </Button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!existingPhotoUrl && !capturedPhoto && !showCamera && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                onClick={startCamera}
                disabled={disabled}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Camera className="w-4 h-4 mr-2" />
                Prendre Photo
              </Button>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
              >
                <Upload className="w-4 h-4 mr-2" />
                Choisir Fichier
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          Formats acceptés: JPG, PNG. Taille max: {Math.round(maxSizeBytes / (1024 * 1024))}MB
        </div>
      </div>
    </Card>
  );
}