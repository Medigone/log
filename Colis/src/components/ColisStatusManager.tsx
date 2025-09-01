import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Steps, type Step } from '@/components/ui/steps';
import { Settings, Package, Truck, CheckCircle, XCircle, Clock } from 'lucide-react';

type ColisStatus = 'Nouveau' | 'Préparé' | 'Enlevé' | 'Partiellement Livré' | 'Livré' | 'Non Livré' | 'Annulé';

interface ColisStatusManagerProps {
  currentStatus: string;
  onStatusChange: (newStatus: string) => Promise<void>;
  canChangeStatus: boolean;
  userRole?: 'preparateur' | 'livreur' | 'admin';
  isLoading?: boolean;
  hasRemainingQuantities?: boolean;
  onPartialDelivery?: () => Promise<void>;
}

// Define status workflow and permissions
const statusWorkflow: Record<ColisStatus, { 
  next: ColisStatus[], 
  allowedRoles: ('preparateur' | 'livreur' | 'admin')[] 
}> = {
  'Nouveau': { 
    next: ['Préparé', 'Annulé'], 
    allowedRoles: ['preparateur', 'admin'] 
  },
  'Préparé': { 
    next: ['Enlevé', 'Annulé'], 
    allowedRoles: ['livreur', 'admin'] 
  },
  'Enlevé': { 
    next: ['Partiellement Livré', 'Livré', 'Non Livré'], 
    allowedRoles: ['livreur', 'admin'] 
  },
  'Partiellement Livré': { 
    next: ['Livré', 'Non Livré'], 
    allowedRoles: ['livreur', 'admin'] 
  },
  'Livré': { 
    next: ['Non Livré'], 
    allowedRoles: ['admin'] 
  },
  'Non Livré': { 
    next: ['Livré', 'Enlevé'], 
    allowedRoles: ['livreur', 'admin'] 
  },
  'Annulé': { 
    next: ['Nouveau'], 
    allowedRoles: ['admin'] 
  },
};

function getStatusIcon(status: string) {
  switch (status) {
    case 'Nouveau': return <Clock className="w-4 h-4" />;
    case 'Préparé': return <Package className="w-4 h-4" />;
    case 'Enlevé': return <Truck className="w-4 h-4" />;
    case 'Partiellement Livré': return <Clock className="w-4 h-4" />;
    case 'Livré': return <CheckCircle className="w-4 h-4" />;
    case 'Non Livré': return <XCircle className="w-4 h-4" />;
    case 'Annulé': return <XCircle className="w-4 h-4" />;
    default: return <Clock className="w-4 h-4" />;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'Nouveau': return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800';
    case 'Préparé': return 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800';
    case 'Enlevé': return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800';
    case 'Partiellement Livré': return 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800';
    case 'Livré': return 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800';
    case 'Non Livré': return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
    case 'Annulé': return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-800';
    default: return 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-800';
  }
}

function createStepsFromStatus(currentStatus: string): Step[] {
  const allStatuses: ColisStatus[] = ['Nouveau', 'Préparé', 'Enlevé', 'Livré'];
  const currentIndex = allStatuses.indexOf(currentStatus as ColisStatus);
  
  return allStatuses.map((status, index) => {
    let stepStatus: 'completed' | 'current' | 'upcoming';
    
    // Handle special cases first
    if (currentStatus === 'Partiellement Livré') {
      if (index <= 2) { // Nouveau, Préparé, Enlevé are completed
        stepStatus = 'completed';
      } else if (status === 'Livré') { // Livré is current (in progress)
        stepStatus = 'current';
      } else {
        stepStatus = 'upcoming';
      }
    } else if (currentStatus === 'Non Livré' || currentStatus === 'Annulé') {
      if (index <= 2) { // Up to "Enlevé" are completed
        stepStatus = 'completed';
      } else {
        stepStatus = 'upcoming';
      }
    } else {
      // Standard workflow logic
      if (index < currentIndex) {
        stepStatus = 'completed';
      } else if (index === currentIndex) {
        // Fix: All reached statuses should be completed (green), not current (blue)
        stepStatus = 'completed';
      } else {
        stepStatus = 'upcoming';
      }
    }

    return {
      id: status,
      title: status,
      status: stepStatus,
    };
  });
}

export function ColisStatusManager({ 
  currentStatus, 
  onStatusChange, 
  canChangeStatus, 
  userRole = 'admin',
  isLoading = false,
  hasRemainingQuantities = false,
  onPartialDelivery
}: ColisStatusManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableStatuses = statusWorkflow[currentStatus as ColisStatus]?.next || [];
  const allowedStatuses = availableStatuses.filter(status => 
    statusWorkflow[status]?.allowedRoles.includes(userRole)
  );

  const steps = createStepsFromStatus(currentStatus);

  const handleStatusChange = async () => {
    if (!selectedStatus) return;
    
    setIsSubmitting(true);
    try {
      await onStatusChange(selectedStatus);
      setIsDialogOpen(false);
      setSelectedStatus('');
    } catch (error) {
      console.error('Error changing status:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDialog = () => {
    setSelectedStatus('');
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Status Progress */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h3 className="text-sm font-medium text-foreground mb-3">Progression du colis</h3>
        <Steps steps={steps} orientation="horizontal" />
      </div>

      {/* Current Status with Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border ${getStatusColor(currentStatus)}`}>
          {getStatusIcon(currentStatus)}
          {currentStatus}
        </div>

        {canChangeStatus && allowedStatuses.length > 0 && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={openDialog}
                disabled={isLoading}
                className="text-xs"
              >
                <Settings className="w-3 h-3 mr-1" />
                Changer statut
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Changer le statut du colis</DialogTitle>
                <DialogDescription>
                  Sélectionnez le nouveau statut. Seules les transitions autorisées sont disponibles.
                </DialogDescription>
              </DialogHeader>
              
              <div className="py-4 space-y-3">
                <div className="text-sm text-muted-foreground">
                  Statut actuel: <span className="font-medium text-foreground">{currentStatus}</span>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Nouveau statut:</label>
                  <div className="grid gap-2">
                    {allowedStatuses.map((status) => (
                      <button
                        key={status}
                        onClick={() => setSelectedStatus(status)}
                        className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                          selectedStatus === status
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-border hover:bg-muted'
                        }`}
                      >
                        {getStatusIcon(status)}
                        <div>
                          <div className="font-medium text-sm">{status}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={isSubmitting}
                >
                  Annuler
                </Button>
                <Button
                  onClick={handleStatusChange}
                  disabled={!selectedStatus || isSubmitting}
                >
                  {isSubmitting ? 'Mise à jour...' : 'Confirmer'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Quick Actions for Common Workflows */}
      {canChangeStatus && (
        <div className="space-y-2">
          {/* Preparateur actions */}
          {userRole === 'preparateur' && currentStatus === 'Nouveau' && (
            <Button
              size="sm"
              onClick={() => onStatusChange('Préparé')}
              disabled={isLoading}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              <Package className="w-4 h-4 mr-2" />
              Marquer comme préparé
            </Button>
          )}

          {/* Livreur actions */}
          {userRole === 'livreur' && currentStatus === 'Préparé' && (
            <Button
              size="sm"
              onClick={() => onStatusChange('Enlevé')}
              disabled={isLoading}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              <Truck className="w-4 h-4 mr-2" />
              Marquer comme enlevé
            </Button>
          )}

          {/* Delivery actions for livreur */}
          {userRole === 'livreur' && (currentStatus === 'Enlevé' || currentStatus === 'Partiellement Livré') && (
            <div className="flex flex-wrap gap-2">
              {/* Partial delivery if there are remaining quantities */}
              {hasRemainingQuantities && onPartialDelivery && currentStatus === 'Enlevé' && (
                <Button
                  size="sm"
                  onClick={onPartialDelivery}
                  disabled={isLoading}
                  variant="outline"
                  className="border-yellow-500 text-yellow-600 hover:bg-yellow-50 dark:border-yellow-400 dark:text-yellow-400 dark:hover:bg-yellow-900/20"
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Livraison partielle
                </Button>
              )}
              
              {/* Complete delivery */}
              <Button
                size="sm"
                onClick={() => onStatusChange('Livré')}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Marquer comme livré
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}