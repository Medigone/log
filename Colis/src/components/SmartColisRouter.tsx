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

function normalizeBl(doc: any) {
  if (!doc) return doc;
  const articles = doc.articles?.length
    ? doc.articles
    : (doc.items || []).map((item: any) => ({
        name: item.name,
        id: item.name,
        article: item.item_code,
        item_name: item.item_name,
        quantite_totale: item.qty,
        quantite_livree: item.custom_quantite_livree || 0,
        quantite_restante: (item.qty || 0) - (item.custom_quantite_livree || 0),
        statut_article: item.custom_statut_article || 'En attente',
      }));
  return {
    ...doc,
    status: doc.custom_statut || doc.status,
    client: doc.customer_name || doc.customer || doc.client,
    bl: doc.name,
    articles,
    image: doc.custom_qr_image || doc.image,
  };
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

  const normalized = normalizeBl(colisData);
  const status = normalized.status;
  
  // Public access (no authentication)
  if (!currentUser) {
    return (
      <PublicTrackingView 
        colisData={normalized}
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
          colisData={normalized}
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
          colisData={normalized}
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