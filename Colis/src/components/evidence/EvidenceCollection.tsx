import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PhotoCapture } from './PhotoCapture';
import { DigitalSignature } from './DigitalSignature';
import { GPSLocation, type LocationData } from './GPSLocation';
import {
  Camera,
  PenTool,
  MapPin,
  MessageSquare,
  CheckCircle,
  Clock,
  FileText
} from 'lucide-react';

interface EvidenceCollectionProps {
  colisId: string;
  onEvidenceUpdate?: (evidence: EvidenceData) => void;
  existingEvidence?: Partial<EvidenceData>;
  disabled?: boolean;
  autoGPS?: boolean;
}

export interface EvidenceData {
  photo_url?: string;
  signature_data?: string;
  customer_name?: string;
  gps_location?: LocationData;
  comments?: string;
  timestamp: string;
}

interface EvidenceSection {
  id: keyof EvidenceData;
  title: string;
  icon: React.ReactNode;
  completed: boolean;
  required: boolean;
}

export function EvidenceCollection({
  colisId,
  onEvidenceUpdate,
  existingEvidence,
  disabled = false,
  autoGPS = true
}: EvidenceCollectionProps) {
  const [evidence, setEvidence] = useState<Partial<EvidenceData>>({
    timestamp: new Date().toISOString(),
    ...existingEvidence
  });
  
  const [comments, setComments] = useState(existingEvidence?.comments || '');
  const [activeSection, setActiveSection] = useState<keyof EvidenceData | null>(null);

  // Update evidence data
  const updateEvidence = (key: keyof EvidenceData, value: any) => {
    const updatedEvidence = {
      ...evidence,
      [key]: value,
      timestamp: new Date().toISOString()
    };
    setEvidence(updatedEvidence);
    onEvidenceUpdate?.(updatedEvidence as EvidenceData);
  };

  // Handle photo upload
  const handlePhotoUploaded = (photoUrl: string) => {
    updateEvidence('photo_url', photoUrl);
  };

  // Handle photo removal
  const handlePhotoRemoved = () => {
    updateEvidence('photo_url', undefined);
  };

  // Handle signature capture
  const handleSignatureCapture = (signatureData: string, customerName: string) => {
    updateEvidence('signature_data', signatureData);
    updateEvidence('customer_name', customerName);
  };

  // Handle signature clear
  const handleSignatureClear = () => {
    updateEvidence('signature_data', undefined);
    updateEvidence('customer_name', undefined);
  };

  // Handle GPS location
  const handleLocationCapture = (location: LocationData) => {
    updateEvidence('gps_location', location);
  };

  // Handle GPS clear
  const handleLocationClear = () => {
    updateEvidence('gps_location', undefined);
  };

  // Handle comments update
  const handleCommentsUpdate = () => {
    updateEvidence('comments', comments.trim() || undefined);
  };

  // Get evidence sections with completion status
  const evidenceSections: EvidenceSection[] = [
    {
      id: 'photo_url',
      title: 'Photo de Livraison',
      icon: <Camera className="w-4 h-4" />,
      completed: !!evidence.photo_url,
      required: true
    },
    {
      id: 'signature_data',
      title: 'Signature Client',
      icon: <PenTool className="w-4 h-4" />,
      completed: !!evidence.signature_data && !!evidence.customer_name,
      required: true
    },
    {
      id: 'gps_location',
      title: 'Géolocalisation',
      icon: <MapPin className="w-4 h-4" />,
      completed: !!evidence.gps_location,
      required: false
    },
    {
      id: 'comments',
      title: 'Commentaires',
      icon: <MessageSquare className="w-4 h-4" />,
      completed: !!evidence.comments,
      required: false
    }
  ];

  // Calculate completion status
  const requiredSections = evidenceSections.filter(s => s.required);
  const completedRequired = requiredSections.filter(s => s.completed).length;
  const totalRequired = requiredSections.length;
  const completionPercentage = Math.round((completedRequired / totalRequired) * 100);

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-4">
      {/* Evidence collection header */}
      <Card className="p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-foreground">
                Preuves de Livraison
              </h2>
            </div>
            <div className="text-sm text-muted-foreground">
              {completedRequired}/{totalRequired} requis
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progression</span>
              <span className="font-medium">{completionPercentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>

          {/* Evidence sections overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {evidenceSections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
                className={`p-2 rounded-lg border text-left transition-colors ${
                  section.completed
                    ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400'
                    : section.required
                    ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
                    : 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-900/20 dark:border-gray-600 dark:text-gray-400'
                } ${
                  activeSection === section.id ? 'ring-2 ring-blue-500' : ''
                }`}
                disabled={disabled}
              >
                <div className="flex items-center gap-2 mb-1">
                  {section.icon}
                  {section.completed && <CheckCircle className="w-3 h-3" />}
                </div>
                <div className="text-xs font-medium">
                  {section.title}
                </div>
                {section.required && (
                  <div className="text-xs opacity-75">
                    Requis
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Timestamp */}
          {evidence.timestamp && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>Dernière mise à jour: {formatTimestamp(evidence.timestamp)}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Evidence sections */}
      {(activeSection === 'photo_url' || !activeSection) && (
        <PhotoCapture
          colisId={colisId}
          onPhotoUploaded={handlePhotoUploaded}
          onPhotoRemoved={handlePhotoRemoved}
          existingPhotoUrl={evidence.photo_url}
          disabled={disabled}
        />
      )}

      {(activeSection === 'signature_data' || !activeSection) && (
        <DigitalSignature
          onSignatureCapture={handleSignatureCapture}
          onSignatureClear={handleSignatureClear}
          existingSignature={evidence.signature_data}
          customerName={evidence.customer_name}
          disabled={disabled}
        />
      )}

      {(activeSection === 'gps_location' || !activeSection) && (
        <GPSLocation
          onLocationCapture={handleLocationCapture}
          onLocationClear={handleLocationClear}
          existingLocation={evidence.gps_location}
          disabled={disabled}
          autoCapture={autoGPS}
        />
      )}

      {(activeSection === 'comments' || !activeSection) && (
        <Card className="p-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-muted-foreground" />
              <h3 className="font-semibold text-foreground">Commentaires de Livraison</h3>
            </div>
            
            <Textarea
              value={comments}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setComments(e.target.value)}
              onBlur={handleCommentsUpdate}
              placeholder="Ajouter des commentaires sur la livraison (optionnel)..."
              className="min-h-[100px]"
              disabled={disabled}
            />
            
            <div className="text-xs text-muted-foreground">
              Informations additionnelles sur les conditions de livraison, problèmes rencontrés, etc.
            </div>
          </div>
        </Card>
      )}

      {/* Completion status */}
      {completionPercentage === 100 && (
        <Card className="p-4 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">
              Toutes les preuves requises ont été collectées
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}