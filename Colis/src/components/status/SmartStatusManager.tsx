import React, { useState, useEffect } from 'react';
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFrappePostCall } from 'frappe-react-sdk';
import {
  CheckCircle,
  Clock,
  Package,
  Truck,
  MapPin,
  AlertTriangle,
  TrendingUp,
  Settings,
  Zap
} from 'lucide-react';

interface SmartStatusManagerProps {
  currentStatus: string;
  colisId: string;
  onStatusChange?: (newStatus: string) => void;
  disabled?: boolean;
  userRole?: string;
}

interface StatusStep {
  id: string;
  label: string;
  status: 'completed' | 'current' | 'upcoming';
  icon: React.ReactNode;
  description?: string;
}

interface DeliveryMetrics {
  total_articles: number;
  total_quantity: number;
  delivered_quantity: number;
  remaining_quantity: number;
  completion_percentage: number;
  delivered_articles: number;
  partial_articles: number;
  undelivered_articles: number;
  article_completion_rate: number;
}

interface SmartStatusResponse {
  success: boolean;
  status_changed: boolean;
  old_status?: string;
  new_status?: string;
  current_status?: string;
  suggested_status?: string;
  metrics: DeliveryMetrics;
  message: string;
}

interface CompletionConfig {
  completion_thresholds: {
    partial_threshold: number;
    nearly_complete_threshold: number;
    complete_threshold: number;
  };
  auto_status_transitions: {
    enable_auto_transitions: boolean;
    require_evidence_for_completion: boolean;
    min_articles_for_partial: number;
  };
  status_priorities: Record<string, number>;
}

export function SmartStatusManager({
  currentStatus,
  colisId,
  onStatusChange,
  disabled = false,
  userRole = 'admin'
}: SmartStatusManagerProps) {
  const [metrics, setMetrics] = useState<DeliveryMetrics | null>(null);
  const [config, setConfig] = useState<CompletionConfig | null>(null);
  const [suggestedStatus, setSuggestedStatus] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const { call: calculateSmartStatus } = useFrappePostCall<SmartStatusResponse>(
    'log.delivery_note_ops.get_smart_delivery_actions'
  );

  const { call: getConfig } = useFrappePostCall<{ success: boolean; config: CompletionConfig }>(
    'log.delivery_note_ops.get_smart_delivery_actions'
  );

  // Load configuration and calculate smart status
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load configuration
        const configResponse = await getConfig({});
        if (configResponse?.success) {
          setConfig(configResponse.config);
        }

        // Calculate smart status
        if (colisId) {
          const statusResponse = await calculateSmartStatus({
            docname: colisId,
            force_recalculate: false
          });

          if (statusResponse?.success) {
            setMetrics(statusResponse.metrics);
            if (statusResponse.suggested_status && statusResponse.suggested_status !== currentStatus) {
              setSuggestedStatus(statusResponse.suggested_status);
            }
          } else {
            console.warn('Smart status calculation failed:', statusResponse?.message);
            // Continue without smart status - component will work with basic functionality
          }
        }
      } catch (error) {
        console.error('Error loading smart status data:', error);
        // Continue without smart status - component will still work for basic status display
      }
    };

    loadData();
  }, [colisId, currentStatus, calculateSmartStatus, getConfig]);

  // Handle applying suggested status
  const handleApplySuggestedStatus = async () => {
    if (!suggestedStatus) return;
    
    setIsCalculating(true);
    try {
      // Apply the suggested status
      onStatusChange?.(suggestedStatus);
      setSuggestedStatus(null);
    } catch (error) {
      console.error('Error applying suggested status:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  // Create status steps with completion logic
  const createStatusSteps = (): StatusStep[] => {
    const allStatuses = ['Nouveau', 'Préparé', 'Enlevé', 'Partiellement Livré', 'Presque Livré', 'Livré'];
    const currentIndex = allStatuses.indexOf(currentStatus);
    
    return allStatuses.map((status, index) => {
      let stepStatus: 'completed' | 'current' | 'upcoming';
      
      // Enhanced logic for "Presque Livré" status
      if (currentStatus === 'Presque Livré') {
        if (index <= 3) { // Up to "Partiellement Livré"
          stepStatus = 'completed';
        } else if (status === 'Presque Livré') {
          stepStatus = 'current';
        } else {
          stepStatus = 'upcoming';
        }
      } else if (currentStatus === 'Partiellement Livré') {
        if (index <= 2) { // Up to "Enlevé"
          stepStatus = 'completed';
        } else if (status === 'Partiellement Livré') {
          stepStatus = 'current';
        } else {
          stepStatus = 'upcoming';
        }
      } else if (currentStatus === 'Non Livré' || currentStatus === 'Annulé') {
        if (index <= 2) {
          stepStatus = 'completed';
        } else {
          stepStatus = 'upcoming';
        }
      } else {
        if (index < currentIndex) {
          stepStatus = 'completed';
        } else if (index === currentIndex) {
          // Fix: All completed statuses should show as completed (green), not current (blue)
          stepStatus = 'completed';
        } else {
          stepStatus = 'upcoming';
        }
      }

      return {
        id: status,
        label: status,
        status: stepStatus,
        icon: getStatusIcon(status),
        description: getStatusDescription(status)
      };
    });
  };

  const getStatusIcon = (status: string) => {
    const iconClass = "w-4 h-4";
    switch (status) {
      case 'Nouveau': return <Package className={iconClass} />;
      case 'Préparé': return <CheckCircle className={iconClass} />;
      case 'Enlevé': return <Truck className={iconClass} />;
      case 'Partiellement Livré': return <Clock className={iconClass} />;
      case 'Presque Livré': return <TrendingUp className={iconClass} />;
      case 'Livré': return <CheckCircle className={iconClass} />;
      default: return <AlertTriangle className={iconClass} />;
    }
  };

  const getStatusDescription = (status: string) => {
    switch (status) {
      case 'Nouveau': return 'Colis créé';
      case 'Préparé': return 'Prêt pour enlèvement';
      case 'Enlevé': return 'En cours de livraison';
      case 'Partiellement Livré': return 'Livraison en cours';
      case 'Presque Livré': return 'Proche de la finalisation';
      case 'Livré': return 'Livraison terminée';
      default: return '';
    }
  };

  const getThresholdColor = (percentage: number) => {
    if (!config) return 'text-gray-500';
    
    const { partial_threshold, nearly_complete_threshold, complete_threshold } = config.completion_thresholds;
    
    if (percentage >= complete_threshold) {
      return 'text-green-600 dark:text-green-400';
    } else if (percentage >= nearly_complete_threshold) {
      return 'text-blue-600 dark:text-blue-400';
    } else if (percentage >= partial_threshold) {
      return 'text-yellow-600 dark:text-yellow-400';
    } else {
      return 'text-red-600 dark:text-red-400';
    }
  };

  const steps = createStatusSteps();

  return (
    <Card className="p-4">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-muted-foreground" />
            <h3 className="font-semibold text-foreground">Statut Intelligent</h3>
          </div>
          {config?.auto_status_transitions.enable_auto_transitions && (
            <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
              <Settings className="w-3 h-3" />
              <span className="text-xs font-medium">Auto</span>
            </div>
          )}
        </div>

        {/* Status progression */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center gap-1">
                  <div className={`
                    flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors
                    ${step.status === 'completed' 
                      ? 'bg-green-100 border-green-500 text-green-700 dark:bg-green-900/20 dark:border-green-400 dark:text-green-400' 
                      : step.status === 'current'
                      ? 'bg-blue-100 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:border-blue-400 dark:text-blue-400'
                      : 'bg-gray-100 border-gray-300 text-gray-500 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400'
                    }
                  `}>
                    {step.status === 'completed' ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      step.icon
                    )}
                  </div>
                  <div className="text-xs text-center">
                    <div className={`font-medium ${
                      step.status === 'completed' ? 'text-green-700 dark:text-green-400' :
                      step.status === 'current' ? 'text-blue-700 dark:text-blue-400' :
                      'text-gray-500 dark:text-gray-400'
                    }`}>
                      {step.label}
                    </div>
                  </div>
                </div>

                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className={`
                    flex-1 h-0.5 mx-2 transition-colors
                    ${(
                      steps[index + 1].status === 'completed' || 
                      (step.status === 'completed' && steps[index + 1].status === 'current')
                    ) 
                      ? 'bg-green-500 dark:bg-green-400' 
                      : step.status === 'completed'
                      ? 'bg-blue-500 dark:bg-blue-400'
                      : 'bg-gray-300 dark:bg-gray-600'
                    }
                  `} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Metrics */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center">
              <div className={`text-2xl font-bold ${getThresholdColor(metrics.completion_percentage)}`}>
                {metrics.completion_percentage}%
              </div>
              <div className="text-xs text-muted-foreground">Completion</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-foreground">
                {metrics.delivered_quantity}/{metrics.total_quantity}
              </div>
              <div className="text-xs text-muted-foreground">Quantités</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-foreground">
                {metrics.delivered_articles}/{metrics.total_articles}
              </div>
              <div className="text-xs text-muted-foreground">Articles</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-yellow-600 dark:text-yellow-400">
                {metrics.remaining_quantity}
              </div>
              <div className="text-xs text-muted-foreground">Restant</div>
            </div>
          </div>
        )}

        {/* Suggested status */}
        {suggestedStatus && suggestedStatus !== currentStatus && (
          <div className="p-3 rounded-lg border bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="text-sm font-medium text-blue-700 dark:text-blue-400">
                  Statut Suggéré: {suggestedStatus}
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-300">
                  Basé sur {metrics?.completion_percentage}% de completion
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleApplySuggestedStatus}
                disabled={disabled || isCalculating}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isCalculating ? 'Application...' : 'Appliquer'}
              </Button>
            </div>
          </div>
        )}

        {/* Configuration info */}
        {config && (
          <div className="text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>Seuils: Partiel {config.completion_thresholds.partial_threshold}%</span>
              <span>Presque {config.completion_thresholds.nearly_complete_threshold}%</span>
              <span>Complet {config.completion_thresholds.complete_threshold}%</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}