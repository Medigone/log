import React from 'react';
import { Card } from '@/components/ui/card';
import { Steps } from '@/components/ui/steps';
import {
  Package,
  Truck,
  MapPin,
  Clock,
  CheckCircle,
  User
} from 'lucide-react';

interface PublicTrackingViewProps {
  colisData: any;
  colisId: string;
}

function createStepsFromStatus(currentStatus: string) {
  const allStatuses = ['Nouveau', 'Préparé', 'Enlevé', 'Livré'];
  const currentIndex = allStatuses.indexOf(currentStatus);
  
  return allStatuses.map((status, index) => {
    let stepStatus: 'completed' | 'current' | 'upcoming';
    
    if (currentStatus === 'Partiellement Livré') {
      if (index <= 2) {
        stepStatus = 'completed';
      } else if (status === 'Livré') {
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
        // Fix: All reached statuses should be completed (green)
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

function StatusBadge({ status }: { status: string }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Nouveau': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Préparé': return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      case 'Enlevé': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'Partiellement Livré': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'Livré': return 'bg-green-50 text-green-700 border-green-200';
      case 'Non Livré': return 'bg-red-50 text-red-700 border-red-200';
      case 'Annulé': return 'bg-gray-50 text-gray-700 border-gray-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium border ${getStatusColor(status)}`}>
      {status}
    </span>
  );
}

export function PublicTrackingView({ colisData, colisId }: PublicTrackingViewProps) {
  const steps = createStepsFromStatus(colisData.status || 'Nouveau');
  
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "—";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Suivi de Colis
            </h1>
            <div className="text-sm text-muted-foreground">
              Colis #{colisData.custom_numero_sequence || colisId}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 pt-8 pb-8">
        {/* Current Status */}
        <Card className="p-6 mb-6 text-center">
          <div className="mb-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 mb-4">
              <Package className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Statut Actuel
            </h2>
            <StatusBadge status={colisData.status || 'Nouveau'} />
          </div>
        </Card>

        {/* Progress Timeline */}
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Progression
          </h3>
          <Steps steps={steps} orientation="horizontal" />
        </Card>

        {/* Package Information */}
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Informations du Colis
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">Client</div>
                <div className="font-medium text-foreground">
                  {colisData.client || "—"}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">Date de création</div>
                <div className="font-medium text-foreground">
                  {formatDate(colisData.date_creation)}
                </div>
              </div>
            </div>
            
            {colisData.bl && (
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">Bon de livraison</div>
                  <div className="font-medium text-foreground">
                    {colisData.bl}
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="text-sm text-muted-foreground">Nombre d'articles</div>
                <div className="font-medium text-foreground">
                  {colisData.articles?.length || 0} articles
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Articles List (Limited for Public) */}
        {colisData.articles && colisData.articles.length > 0 && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Articles ({colisData.articles.length})
            </h3>
            
            <div className="space-y-3">
              {colisData.articles.map((article: any, index: number) => (
                <div
                  key={article.id || article.name || `article-${index}`}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div>
                    <div className="font-medium text-foreground">
                      Article #{index + 1}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Quantité: {article.quantite_totale}
                    </div>
                  </div>
                  
                  <StatusBadge status={article.statut_article || 'En attente'} />
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-muted-foreground">
          <p>
            Pour plus d'informations, contactez votre livreur ou le service client.
          </p>
        </div>
      </div>
    </div>
  );
}