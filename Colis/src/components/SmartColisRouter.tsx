import ColisDetails from '@/pages/colis/ColisDetails';
import { PickupInterface } from '@/components/interfaces/PickupInterface';
import { DeliveryInterface } from '@/components/interfaces/DeliveryInterface';
import { PublicTrackingView } from '@/components/interfaces/PublicTrackingView';

interface SmartColisRouterProps {
  colisId: string;
  livraisonId?: string;
  onBackToLivraison?: () => void;
  colisData: any;
  currentUser: string | null | undefined;
  isLoading?: boolean;
}

export function SmartColisRouter({
  colisId,
  livraisonId,
  onBackToLivraison,
  colisData,
  currentUser,
  isLoading
}: SmartColisRouterProps) {
  
  if (isLoading || !colisData) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center px-4 bg-background">
        <div className="bg-card rounded-2xl p-5 shadow-lg">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white/40 mx-auto mb-3" />
          <p className="text-muted-foreground">Chargement…</p>
        </div>
      </div>
    );
  }

  const status = colisData.status;
  
  // Public access (no authentication)
  if (!currentUser) {
    return (
      <PublicTrackingView 
        colisData={colisData}
        colisId={colisId}
      />
    );
  }

  // Smart routing based on status only (same interface for mobile and desktop)
  const getOptimalInterface = () => {
    // Pickup interface for 'Préparé' status
    if (status === 'Préparé') {
      return (
        <PickupInterface
          colisData={colisData}
          colisId={colisId}
          livraisonId={livraisonId}
          onBackToLivraison={onBackToLivraison}
        />
      );
    }
    
    // Delivery interface for delivery statuses
    if (status === 'Enlevé' || status === 'Partiellement Livré') {
      return (
        <DeliveryInterface
          colisData={colisData}
          colisId={colisId}
          livraisonId={livraisonId}
          onBackToLivraison={onBackToLivraison}
        />
      );
    }
    
    // Default to detailed view for all other cases
    return (
      <ColisDetails
        colisId={colisId}
        livraisonId={livraisonId}
        onBackToLivraison={onBackToLivraison}
      />
    );
  };

  return getOptimalInterface();
}