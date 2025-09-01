import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ColisStatusManager } from '@/components/ColisStatusManager';
import { EvidenceCollection, type EvidenceData } from '@/components/evidence/EvidenceCollection';
import { useUserRole } from '@/hooks/useUserRole';
import { 
  useEnhancedDeliveryUpdate,
  useSmartDeliveryActions,
  useQuickAction,
  useArticleQuantityTracking,
  DeliveryUtils
} from '@/hooks/useDeliveryAPI';
import { useFrappeAuth, useFrappeUpdateDoc } from 'frappe-react-sdk';
import type { QuickAction, DeliverySummary } from '@/types/delivery';
import {
  CheckCircle,
  XCircle,
  Clock,
  Camera,
  MapPin,
  User,
  Package,
  FileText,
  Circle,
  Truck,
  Plus,
  Minus,
  Target,
  AlertTriangle,
  MessageSquare,
  Shield
} from 'lucide-react';

interface DeliveryInterfaceProps {
  colisData: any;
  colisId: string;
  livraisonId?: string;
  onBackToLivraison?: () => void;
}

interface ArticleDeliveryState {
  id: string;
  toDeliver: number;
  status: 'pending' | 'delivered' | 'partial' | 'failed';
  reason: string;
}

// Helper functions for status icon and color
function getStatusIcon(status: string) {
  switch (status) {
    case 'Nouveau': return <Clock className="w-3 h-3" />;
    case 'Préparé': return <Package className="w-3 h-3" />;
    case 'Enlevé': return <Truck className="w-3 h-3" />;
    case 'Partiellement Livré': return <Clock className="w-3 h-3" />;
    case 'Livré': return <CheckCircle className="w-3 h-3" />;
    case 'Non Livré': return <XCircle className="w-3 h-3" />;
    case 'Annulé': return <XCircle className="w-3 h-3" />;
    default: return <Clock className="w-3 h-3" />;
  }
}

function getStatusTextColor(status: string) {
  switch (status) {
    case 'Nouveau': return 'text-blue-700 dark:text-blue-400';
    case 'Préparé': return 'text-cyan-700 dark:text-cyan-400';
    case 'Enlevé': return 'text-orange-700 dark:text-orange-400';
    case 'Partiellement Livré': return 'text-yellow-700 dark:text-yellow-400';
    case 'Livré': return 'text-green-700 dark:text-green-400';
    case 'Non Livré': return 'text-red-700 dark:text-red-400';
    case 'Annulé': return 'text-gray-700 dark:text-gray-400';
    default: return 'text-gray-700 dark:text-gray-400';
  }
}

function getStatusBadgeClasses(status: string) {
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

export function DeliveryInterface({
  colisData,
  colisId,
  livraisonId,
  onBackToLivraison
}: DeliveryInterfaceProps) {
  const { currentUser } = useFrappeAuth();
  const userRole = useUserRole(currentUser);
  const { updateDoc: updateColis } = useFrappeUpdateDoc();
  
  // Enhanced delivery hooks
  const { updateDelivery, loading: updateLoading } = useEnhancedDeliveryUpdate();
  const { getActions } = useSmartDeliveryActions();
  const { executeAction, loading: actionLoading } = useQuickAction();
  const quantityTrackingAPI = useArticleQuantityTracking();
  
  // State management
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingActions, setIsLoadingActions] = useState(true);
  const [showDetailedInterface, setShowDetailedInterface] = useState(false);
  const [showEvidenceCollection, setShowEvidenceCollection] = useState(false);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [customerPresent, setCustomerPresent] = useState<boolean | null>(null);
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [deliverySummary, setDeliverySummary] = useState<DeliverySummary | null>(null);
  const [evidenceData, setEvidenceData] = useState<EvidenceData | null>(null);
  
  const [articleStates, setArticleStates] = useState<ArticleDeliveryState[]>(
    colisData.articles?.map((article: any) => ({
      id: article.id || article.name,
      toDeliver: article.quantite_restante || 0,
      status: 'pending',
      reason: ''
    })) || []
  );

  // Load smart actions on component mount
  useEffect(() => {
    let isMounted = true;
    
    const loadSmartActions = async () => {
      if (!colisId || !isMounted) return;
      
      setIsLoadingActions(true);
      
      try {
        console.log('Loading smart actions for colis:', colisId);
        console.log('Colis data articles:', colisData.articles);
        
        const response = await getActions(colisId);
        
        if (!isMounted) return; // Prevent state update if component unmounted
        
        console.log('Smart actions response:', response);
        
        // Check if response has success property directly or nested in message
        const actualResponse = response?.message || response;
        console.log('Actual response data:', actualResponse);
        
        if (actualResponse && typeof actualResponse === 'object' && 
            'success' in actualResponse && actualResponse.success && 
            'quick_actions' in actualResponse) {
          setQuickActions(actualResponse.quick_actions);
          if ('delivery_summary' in actualResponse && actualResponse.delivery_summary) {
            setDeliverySummary(actualResponse.delivery_summary);
          }
          console.log('Quick actions loaded:', actualResponse.quick_actions);
        } else {
          console.error('Smart actions failed, using fallback');
          
          // Fallback actions
          const fallbackActions: QuickAction[] = [
            {
              id: 'deliver_all',
              label: 'Livrer Tout',
              description: 'Livrer tous les articles restants',
              type: 'success',
              icon: 'check-circle'
            },
            {
              id: 'partial_delivery',
              label: 'Livraison Partielle',
              description: 'Livrer certains articles seulement',
              type: 'warning',
              icon: 'package'
            },
            {
              id: 'client_absent',
              label: 'Client Absent',
              description: 'Client non disponible',
              type: 'error',
              icon: 'user-x'
            }
          ];
          
          setQuickActions(fallbackActions);
        }
      } catch (error) {
        if (!isMounted) return;
        
        console.error('Failed to load smart actions:', error);
        
        // Fallback actions in case of complete failure
        const fallbackActions: QuickAction[] = [
          {
            id: 'deliver_all',
            label: 'Livrer Tout',
            description: 'Livrer tous les articles',
            type: 'success',
            icon: 'check-circle'
          },
          {
            id: 'partial_delivery',
            label: 'Livraison Partielle',
            description: 'Sélectionner les articles à livrer',
            type: 'warning',
            icon: 'package'
          }
        ];
        setQuickActions(fallbackActions);
      } finally {
        if (isMounted) {
          setIsLoadingActions(false);
        }
      }
    };
    
    loadSmartActions();
    
    return () => {
      isMounted = false;
    };
  }, [colisId]); // Remove getActions from dependencies to prevent infinite loop

  const handleStatusChange = async (newStatus: string) => {
    if (!colisId) return;
    
    setIsSaving(true);
    try {
      await updateColis("Colis", colisId, { status: newStatus });
      // Reload page to reflect changes
      window.location.reload();
    } catch (e) {
      console.error(e);
      throw new Error("Erreur lors du changement de statut");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePartialDelivery = async () => {
    await handleStatusChange('Partiellement Livré');
  };

  const handleQuickAction = async (actionId: string, reason?: string) => {
    setIsSaving(true);
    try {
      console.log('Executing quick action:', actionId);
      
      switch (actionId) {
        case 'deliver_all':
          // Set all articles to be delivered
          setArticleStates(prev => prev.map(state => {
            const article = colisData.articles?.find((a: any) => 
              (a.id || a.name) === state.id
            );
            return {
              ...state,
              toDeliver: article?.quantite_restante || 0,
              status: 'delivered',
              reason: ''
            };
          }));
          setCustomerPresent(true);
          break;
          
        case 'partial_delivery':
          // Show detailed interface for manual selection
          setShowDetailedInterface(true);
          // Initialize all articles with 0 quantity to force user selection
          setArticleStates(prev => prev.map(state => ({
            ...state,
            toDeliver: 0,
            status: 'pending',
            reason: ''
          })));
          break;
          
        case 'client_absent':
          // Mark all articles as failed with reason
          setArticleStates(prev => prev.map(state => ({
            ...state,
            toDeliver: 0,
            status: 'failed',
            reason: 'Client absent'
          })));
          setCustomerPresent(false);
          break;
          
        case 'access_refused':
          // Mark all articles as failed with reason
          setArticleStates(prev => prev.map(state => ({
            ...state,
            toDeliver: 0,
            status: 'failed',
            reason: 'Accès refusé'
          })));
          setCustomerPresent(false);
          break;
          
        default:
          console.warn('Unknown action:', actionId);
      }
      
      console.log('Quick action completed:', actionId);
    } catch (error) {
      console.error('Error executing quick action:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEnhancedDelivery = async () => {
    if (!canSubmitDelivery()) {
      console.warn('Cannot submit delivery: validation failed');
      return;
    }
    
    setIsSaving(true);
    try {
      console.log('Preparing delivery data...');
      console.log('Article states:', articleStates);
      
      // Filter and prepare valid article delivery data
      const validArticleDeliveries = articleStates
        .filter(state => state.status === 'delivered' || state.status === 'failed')
        .map(state => {
          const article = colisData.articles?.find((a: any) => 
            (a.id || a.name) === state.id
          );
          
          return {
            article_name: article?.name || article?.article || state.id,
            quantity_delivered: state.status === 'delivered' ? state.toDeliver : 0,
            status: state.status === 'delivered' ? 'delivered' as const : 'undeliverable' as const,
            reason: state.reason || (state.status === 'failed' ? 'Non livré' : '')
          };
        });
      
      console.log('Valid article deliveries:', validArticleDeliveries);
      
      if (validArticleDeliveries.length === 0) {
        console.error('No valid article deliveries to submit');
        return;
      }
      
      // Prepare delivery data
      const deliveryData = {
        articles: validArticleDeliveries
      };
      
      // Prepare evidence data
      const evidenceToSubmit = evidenceData ? {
        photo_data: evidenceData.photo_url,
        signature_data: evidenceData.signature_data,
        customer_name: evidenceData.customer_name,
        gps_location: evidenceData.gps_location,
        comments: evidenceData.comments || deliveryNotes || undefined
      } : {
        comments: deliveryNotes || undefined
      };
      
      console.log('Submitting delivery data:', deliveryData);
      console.log('Submitting evidence data:', evidenceToSubmit);
      
      const response = await updateDelivery(colisId, deliveryData, evidenceToSubmit);
      console.log('Delivery response:', response);
      
      // Handle Frappe response wrapping - check both direct and nested success
      const actualDeliveryResponse = response?.message || response;
      console.log('Actual delivery response:', actualDeliveryResponse);
      
      if (actualDeliveryResponse?.success) {
        console.log('Delivery successful, reloading page...');
        // Show success message before reload
        alert('Livraison mise à jour avec succès!');
        window.location.reload();
      } else {
        console.error('Enhanced delivery failed:', actualDeliveryResponse?.message || actualDeliveryResponse);
        alert('Erreur lors de la livraison: ' + (actualDeliveryResponse?.message || 'Erreur inconnue'));
      }
    } catch (error) {
      console.error('Error in enhanced delivery:', error);
      alert('Erreur lors de la livraison: ' + (error instanceof Error ? error.message : 'Erreur inconnue'));
    } finally {
      setIsSaving(false);
    }
  };

  const updateArticleQuantity = (articleId: string, quantity: number) => {
    setArticleStates(prev => prev.map(state => 
      state.id === articleId 
        ? { 
            ...state, 
            toDeliver: quantity,
            status: quantity > 0 ? 'delivered' : 'failed'
          }
        : state
    ));
  };

  const canSubmitDelivery = () => {
    // Check if we have any articles with valid delivery decisions
    const hasValidDeliveries = articleStates.some(state => 
      (state.status === 'delivered' && state.toDeliver > 0) || 
      (state.status === 'failed')
    );
    
    // If detailed interface is open, require at least one article selection
    if (showDetailedInterface) {
      return hasValidDeliveries;
    }
    
    // For quick actions, require some state change
    return hasValidDeliveries;
  };

  const submitDelivery = async () => {
    await handleEnhancedDelivery();
  };

  const getActionButtonClass = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-900/20 disabled:opacity-60 disabled:cursor-not-allowed';
      case 'warning':
        return 'bg-gray-50 border-yellow-300 text-yellow-700 hover:bg-yellow-50 dark:bg-gray-900 dark:border-yellow-600 dark:text-yellow-400 dark:hover:bg-yellow-900/20 disabled:opacity-60 disabled:cursor-not-allowed';
      case 'error':
        return 'bg-gray-50 border-red-300 text-red-700 hover:bg-red-50 dark:bg-gray-900 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-60 disabled:cursor-not-allowed';
      default:
        return 'bg-gray-50 border-blue-300 text-blue-700 hover:bg-blue-50 dark:bg-gray-900 dark:border-blue-600 dark:text-blue-400 dark:hover:bg-blue-900/20 disabled:opacity-60 disabled:cursor-not-allowed';
    }
  };

  const getActionIcon = (iconName: string) => {
    const iconClass = "w-5 h-5 mr-2";
    switch (iconName) {
      case 'check-circle':
        return <CheckCircle className={iconClass} />;
      case 'package':
        return <Package className={iconClass} />;
      case 'user-x':
        return <User className={iconClass} />;
      case 'lock':
        return <XCircle className={iconClass} />;
      default:
        return <Target className={iconClass} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap justify-between">
            <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
              {livraisonId && onBackToLivraison && (
                <>
                  <button
                    onClick={onBackToLivraison}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/30"
                    title="Retour aux détails de la livraison"
                  >
                    <FileText className="w-3 h-3" />
                    <span className="text-xs font-medium">Livraison {livraisonId}</span>
                  </button>
                  <Circle className="w-1 h-1 fill-current" />
                </>
              )}
              <span>Livraison Colis</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-800">
                <Truck className="w-3 h-3" />
                <span className="text-xs font-medium">Mode Livraison</span>
              </div>
              <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border ${getStatusBadgeClasses(colisData.status || 'Enlevé')}`}>
                {getStatusIcon(colisData.status || 'Enlevé')}
                <span className="text-xs font-medium">{colisData.status || 'Enlevé'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-20">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-foreground mb-2">
            Livraison Colis {colisData.custom_numero_sequence || "—"}
          </h1>
          <div className="text-sm text-muted-foreground">
            Client: {colisData.client || "—"}
          </div>
        </div>



        {/* Smart Quick Actions */}
        {deliverySummary && (
          <Card className="p-4 mb-4">
            <div className="text-sm text-muted-foreground mb-3">
              Progression: {deliverySummary.delivered_quantity}/{deliverySummary.total_quantity} articles ({deliverySummary.completion_percentage}%)
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${deliverySummary.completion_percentage}%` }}
              />
            </div>
          </Card>
        )}

        {/* Enhanced Quick Action Buttons */}
        <div className="space-y-3 mb-6">
          {isLoadingActions ? (
            <div className="space-y-3">
              <div className="h-16 bg-gray-200 rounded-lg animate-pulse dark:bg-gray-700"></div>
              <div className="h-16 bg-gray-200 rounded-lg animate-pulse dark:bg-gray-700"></div>
              <div className="h-16 bg-gray-200 rounded-lg animate-pulse dark:bg-gray-700"></div>
            </div>
          ) : quickActions.length > 0 ? (
            quickActions.map((action) => (
              <button 
                key={action.id}
                onClick={() => handleQuickAction(action.id)}
                className={`w-full py-4 px-6 text-lg rounded-lg border transition-all duration-200 ${getActionButtonClass(action.type)}`}
                disabled={isSaving || updateLoading || actionLoading}
              >
                <div className="flex items-center justify-center gap-3">
                  {getActionIcon(action.icon)}
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{action.label}</span>
                    {action.description && (
                      <span className="text-sm opacity-75">{action.description}</span>
                    )}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="text-center py-4">
              <div className="text-sm text-muted-foreground">Aucune action disponible</div>
            </div>
          )}
        </div>

        {/* Articles List */}
        {colisData.articles && colisData.articles.length > 0 && (
          <Card className="p-4 mb-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Articles à Livrer ({colisData.articles.length})
            </h3>
            
            <div className="space-y-3">
              {colisData.articles.map((article: any, index: number) => (
                <div
                  key={article.id || article.name || `article-${index}`}
                  className="flex items-center gap-4 p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <Package className="w-4 h-4" />
                  </div>
                  
                  <div className="flex-1">
                    <div className="font-medium text-foreground">
                      {article.article}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Restant à livrer: {article.quantite_restante || 0}
                    </div>
                  </div>

                  <div className={`px-3 py-1 rounded-md text-xs font-medium ${
                    (article.quantite_restante || 0) > 0
                      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}>
                    {(article.quantite_restante || 0) > 0 ? 'En attente' : 'Livré'}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 pt-4 border-t border-border">
              <Button
                onClick={() => setShowDetailedInterface(true)}
                variant="outline"
                className="w-full py-3 border-blue-500 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-900/20"
                disabled={isSaving}
              >
                <Target className="w-4 h-4 mr-2" />
                Livraison Détaillée (Sélection Manuelle)
              </Button>
            </div>
          </Card>
        )}

        {/* Detailed Article Interface */}
        {showDetailedInterface && (
          <Card className="p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                Livraison Détaillée
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDetailedInterface(false)}
              >
                <XCircle className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="space-y-3">
              {colisData.articles?.map((article: any, index: number) => {
                const articleId = article.id || article.name || `article-${index}`;
                const state = articleStates.find(s => s.id === articleId);
                
                return (
                  <div key={articleId} className="border rounded-lg p-3">
                    <div className="font-medium text-foreground mb-2">
                      {article.article}
                    </div>
                    <div className="text-sm text-muted-foreground mb-3">
                      Restant à livrer: {article.quantite_restante}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max={article.quantite_restante}
                        value={state?.toDeliver || 0}
                        onChange={(e) => updateArticleQuantity(articleId, parseInt(e.target.value) || 0)}
                        className="w-20"
                        placeholder="Qté"
                      />
                      <Button
                        size="sm"
                        onClick={() => updateArticleQuantity(articleId, article.quantite_restante)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        Tout
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateArticleQuantity(articleId, 0)}
                      >
                        Aucun
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Delivery Notes */}
        <Card className="p-4 mb-6">
          <h3 className="text-base font-semibold text-foreground mb-3">
            Notes de Livraison
          </h3>
          <textarea
            value={deliveryNotes}
            onChange={(e) => setDeliveryNotes(e.target.value)}
            className="w-full p-3 rounded-md border border-border bg-background text-foreground text-sm resize-none"
            rows={3}
            placeholder="Ajoutez des commentaires sur la livraison..."
          />
        </Card>

        {/* Evidence Collection */}
        {showEvidenceCollection && (
          <EvidenceCollection
            colisId={colisId}
            onEvidenceUpdate={setEvidenceData}
            existingEvidence={evidenceData || undefined}
            disabled={isSaving}
            autoGPS={true}
          />
        )}

        {/* Evidence Collection Toggle */}
        {!showEvidenceCollection && (
          <Card className="p-4 mb-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-foreground">
                  Preuves de Livraison
                </h3>
                <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                  <Shield className="w-3 h-3" />
                  <span className="text-xs font-medium">{evidenceData ? 'Collectées' : 'Recommandées'}</span>
                </div>
              </div>
              
              <Button 
                onClick={() => setShowEvidenceCollection(true)}
                variant="outline"
                className="w-full py-3 border-blue-500 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-900/20"
                disabled={isSaving}
              >
                <Camera className="w-4 h-4 mr-2" />
                {evidenceData ? 'Modifier les Preuves' : 'Collecter les Preuves'}
              </Button>
              
              {evidenceData && (
                <div className="text-xs text-green-600 dark:text-green-400 text-center">
                  ✓ Preuves collectées: {[
                    evidenceData.photo_url && 'Photo',
                    evidenceData.signature_data && 'Signature',
                    evidenceData.gps_location && 'GPS',
                    evidenceData.comments && 'Commentaires'
                  ].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Fixed Bottom Action */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-border dark:bg-background">
        <Button 
          onClick={submitDelivery}
          disabled={!canSubmitDelivery() || isSaving}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Traitement...' : 'Finaliser la Livraison'}
        </Button>
        
        {showDetailedInterface && !canSubmitDelivery() && (
          <div className="text-sm text-amber-600 dark:text-amber-400 mt-2 text-center">
            ⚠️ Veuillez sélectionner au moins un article à livrer ou marquer comme non livré
          </div>
        )}
      </div>
    </div>
  );
}