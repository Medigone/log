import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  MapPin,
  Navigation,
  Clock,
  AlertTriangle,
  CheckCircle,
  Loader2,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

interface GPSLocationProps {
  onLocationCapture?: (location: LocationData) => void;
  onLocationClear?: () => void;
  existingLocation?: LocationData;
  disabled?: boolean;
  autoCapture?: boolean;
  highAccuracy?: boolean;
  timeout?: number;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  timestamp: string;
  address?: string;
}

interface LocationError {
  code: number;
  message: string;
}

export function GPSLocation({
  onLocationCapture,
  onLocationClear,
  existingLocation,
  disabled = false,
  autoCapture = false,
  highAccuracy = true,
  timeout = 15000
}: GPSLocationProps) {
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(existingLocation || null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Check if geolocation is supported
  const isGeolocationSupported = 'geolocation' in navigator;

  // Format coordinates for display
  const formatCoordinates = useCallback((lat: number, lng: number) => {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }, []);

  // Format accuracy for display
  const formatAccuracy = useCallback((accuracy: number) => {
    if (accuracy < 1000) {
      return `±${Math.round(accuracy)}m`;
    } else {
      return `±${(accuracy / 1000).toFixed(1)}km`;
    }
  }, []);

  // Get address from coordinates (reverse geocoding)
  const getAddressFromCoordinates = useCallback(async (lat: number, lng: number): Promise<string | undefined> => {
    try {
      // Using a free geocoding service (you can replace with your preferred service)
      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=fr`
      );
      
      if (response.ok) {
        const data = await response.json();
        return data.display_name || data.locality || undefined;
      }
    } catch (err) {
      console.warn('Reverse geocoding failed:', err);
    }
    return undefined;
  }, []);

  // Capture GPS location
  const captureLocation = useCallback(async () => {
    if (!isGeolocationSupported || disabled) return;

    setIsCapturing(true);
    setError(null);

    const options: PositionOptions = {
      enableHighAccuracy: highAccuracy,
      timeout: timeout,
      maximumAge: 60000 // Accept cached location up to 1 minute old
    };

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, options);
      });

      const { latitude, longitude, accuracy, altitude, heading, speed } = position.coords;
      const timestamp = new Date().toISOString();

      // Get address (optional)
      const address = await getAddressFromCoordinates(latitude, longitude);

      const locationData: LocationData = {
        latitude,
        longitude,
        accuracy,
        altitude: altitude || undefined,
        heading: heading || undefined,
        speed: speed || undefined,
        timestamp,
        address
      };

      setCurrentLocation(locationData);
      setLastUpdate(new Date());
      onLocationCapture?.(locationData);

    } catch (err) {
      const geoError = err as GeolocationPositionError;
      let errorMessage = 'Erreur de géolocalisation';

      switch (geoError.code) {
        case geoError.PERMISSION_DENIED:
          errorMessage = 'Permission de géolocalisation refusée. Veuillez autoriser l\'accès à votre position.';
          break;
        case geoError.POSITION_UNAVAILABLE:
          errorMessage = 'Position indisponible. Vérifiez que le GPS est activé.';
          break;
        case geoError.TIMEOUT:
          errorMessage = 'Délai d\'attente dépassé. Réessayez dans un lieu avec une meilleure réception.';
          break;
        default:
          errorMessage = `Erreur de géolocalisation: ${geoError.message}`;
      }

      setError(errorMessage);
      console.error('Geolocation error:', geoError);
    } finally {
      setIsCapturing(false);
    }
  }, [isGeolocationSupported, disabled, highAccuracy, timeout, getAddressFromCoordinates, onLocationCapture]);

  // Clear location
  const clearLocation = useCallback(() => {
    setCurrentLocation(null);
    setLastUpdate(null);
    setError(null);
    onLocationClear?.();
  }, [onLocationClear]);

  // Open location in maps
  const openInMaps = useCallback((location: LocationData) => {
    const { latitude, longitude } = location;
    const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
    window.open(url, '_blank');
  }, []);

  // Auto-capture location on mount if enabled
  useEffect(() => {
    if (autoCapture && !currentLocation && !disabled) {
      captureLocation();
    }
  }, [autoCapture, currentLocation, disabled, captureLocation]);

  // Get accuracy color based on value
  const getAccuracyColor = useCallback((accuracy: number) => {
    if (accuracy <= 10) return 'text-green-600 dark:text-green-400';
    if (accuracy <= 50) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  }, []);

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Géolocalisation</h3>
        </div>

        {/* Geolocation not supported */}
        {!isGeolocationSupported && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">Géolocalisation non supportée par ce navigateur</span>
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Current location display */}
        {currentLocation && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg border bg-green-50 dark:bg-green-900/20">
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">
                      Position capturée
                    </span>
                  </div>
                  
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <Navigation className="w-3 h-3 text-muted-foreground" />
                      <span className="font-mono text-xs">
                        {formatCoordinates(currentLocation.latitude, currentLocation.longitude)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      <span className={`text-xs ${getAccuracyColor(currentLocation.accuracy)}`}>
                        Précision: {formatAccuracy(currentLocation.accuracy)}
                      </span>
                    </div>
                    
                    {currentLocation.address && (
                      <div className="text-xs text-muted-foreground">
                        📍 {currentLocation.address}
                      </div>
                    )}
                    
                    {lastUpdate && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {lastUpdate.toLocaleTimeString('fr-FR')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openInMaps(currentLocation)}
                  className="ml-2"
                >
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={captureLocation}
                disabled={disabled || isCapturing}
              >
                {isCapturing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Actualiser
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={clearLocation}
                disabled={disabled}
                className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/20"
              >
                Supprimer
              </Button>
            </div>
          </div>
        )}

        {/* Capture location button */}
        {!currentLocation && isGeolocationSupported && (
          <div className="space-y-2">
            <Button
              onClick={captureLocation}
              disabled={disabled || isCapturing}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isCapturing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Capture en cours...
                </>
              ) : (
                <>
                  <Navigation className="w-4 h-4 mr-2" />
                  Capturer Position
                </>
              )}
            </Button>
            
            <div className="text-xs text-muted-foreground text-center space-y-1">
              <p>La géolocalisation permet de vérifier le lieu de livraison</p>
              {highAccuracy && (
                <p className="text-yellow-600 dark:text-yellow-400">
                  ⚠️ Mode haute précision activé (peut prendre plus de temps)
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}