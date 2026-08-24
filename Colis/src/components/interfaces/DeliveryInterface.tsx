import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFrappeAuth, useFrappeUpdateDoc, useFrappePostCall } from 'frappe-react-sdk';
import {
  CheckCircle,
  XCircle,
  Package,
  FileText,
  Circle,
  Truck,
  Plus,
  Minus,
  Camera
} from 'lucide-react';

interface DeliveryInterfaceProps {
  colisData: any;
  colisId: string;
  livraisonId?: string;
  onBackToLivraison?: () => void;
}

interface ArticleDeliveryState {
  id: string;
  name: string; // Nom du document Articles Colis pour l'API
  item_code: string;
  item_name: string;
  quantite_totale: number;
  quantite_restante: number;
  quantite_a_livrer: number;
  statut_article: string;
}

function MetaChip({
  icon,
  label,
  value,
  title,
}: {
  icon: React.ReactNode;
  label?: string;
  value: React.ReactNode;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-gray-50 text-gray-500 border border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-600"
    >
      <span className="flex items-center justify-center w-4 h-4 text-current">
        {icon}
      </span>
      <span className="inline-flex items-center gap-1.5 text-current text-sm">
        {label && (
          <span className="font-medium opacity-80">
            {label}
          </span>
        )}
        <span className="font-semibold">{value}</span>
      </span>
    </div>
  );
}

export function DeliveryInterface({
  colisData,
  colisId,
  livraisonId,
  onBackToLivraison
}: DeliveryInterfaceProps) {
  const { } = useFrappeAuth();
  const { updateDoc: updateColis } = useFrappeUpdateDoc();
  const { call: deliverArticleQuantity } = useFrappePostCall('log.delivery_note_ops.deliver_article_quantity_direct');
  const { call: recalculateStatus } = useFrappePostCall('log.delivery_note_ops.get_available_actions');
  const { call: setStatusLivre } = useFrappePostCall('log.delivery_note_ops.set_status_livre');
  
  // State management
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [articleStates, setArticleStates] = useState<ArticleDeliveryState[]>(
    colisData.articles?.map((article: any) => ({
      id: article.id || article.name, // ID pour l'interface
      name: article.name, // Nom du document Articles Colis pour l'API
      item_code: article.article,
      item_name: article.item_name || article.article,
      quantite_totale: article.quantite_totale || 0,
      quantite_restante: article.quantite_restante || 0,
      quantite_a_livrer: 0,
      statut_article: article.statut_article || 'En attente'
    })) || []
  );
  const [gpsLocation] = useState<string>('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [deliveryErrors, setDeliveryErrors] = useState<string[]>([]);
  const [deliverySuccess, setDeliverySuccess] = useState<boolean>(false);
  const [currentStatus, setCurrentStatus] = useState<string>(colisData.status || '');

  // Fonctions de gestion des quantités
  const updateArticleQuantity = (articleId: string, quantity: number) => {
    setArticleStates(prev => prev.map(state => 
      state.id === articleId 
        ? { 
            ...state, 
            quantite_a_livrer: Math.min(quantity, state.quantite_restante)
          }
        : state
    ));
  };

  const handleDeliverAll = () => {
    setArticleStates(prev => prev.map(state => ({
      ...state,
      quantite_a_livrer: state.quantite_restante
    })));
  };

  const handleDeliverNone = () => {
    setArticleStates(prev => prev.map(state => ({
      ...state,
      quantite_a_livrer: 0
    })));
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPhotoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };


  const handleConfirmClick = () => {
    setShowConfirmDialog(true);
  };

  const submitDelivery = async () => {
    setShowConfirmDialog(false);
    setIsSaving(true);
    setDeliveryErrors([]);
    setDeliverySuccess(false);
    try {
      // Récupérer la position GPS automatiquement
      let currentGpsLocation = gpsLocation;
      if (navigator.geolocation) {
        try {
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 10000,
              enableHighAccuracy: true
            });
          });
          const { latitude, longitude } = position.coords;
          currentGpsLocation = `${latitude}, ${longitude}`;
        } catch (gpsError) {
          console.warn('Impossible d\'obtenir la position GPS:', gpsError);
        }
      }

      // Mettre à jour chaque article dans la table enfant Articles Colis
      const errors: string[] = [];
      for (const article of articleStates) {
        if (article.quantite_a_livrer > 0) {
          try {
            // Appeler l'API pour livrer la quantité spécifique de cet article
            await deliverArticleQuantity({
              article_docname: article.name, // Nom du document Articles Colis
              quantity_to_deliver: article.quantite_a_livrer,
              update_date: true
            });
          } catch (articleError: any) {
            const errorMsg = `Erreur article ${article.item_code}: ${articleError?.message || articleError}`;
            errors.push(errorMsg);
          }
        }
      }
      
      if (errors.length > 0) {
        setDeliveryErrors(errors);
      }

      // Recalculer le statut du colis après la livraison des articles
      if (errors.length === 0) {
        try {
          const statusResult = await recalculateStatus({
            colis_id: colisId
          });
          if (statusResult?.success) {
            console.log(`Statut mis à jour: ${statusResult.old_status} → ${statusResult.new_status}`);
            setCurrentStatus(statusResult.new_status);
          }
        } catch (statusError) {
          console.error('Erreur lors du recalcul du statut:', statusError);
        }
      }

      // Mettre à jour les champs GPS et photo si fournis
      const updateData: any = {};
      if (currentGpsLocation) {
        updateData.gps = currentGpsLocation;
      }
      if (photoFile) {
        // Ici on pourrait uploader la photo, mais pour l'instant on met juste un placeholder
        updateData.photo_livraison = 'Photo uploadée';
      }

      // Mettre à jour le colis avec GPS et photo si nécessaire
      if (Object.keys(updateData).length > 0) {
        await updateColis("Delivery Note", colisId, {
          custom_gps: updateData.gps,
          custom_photo_livraison: updateData.photo_livraison,
        });
      }

      // Utiliser l'API set_status_livre qui gère automatiquement l'utilisateur et la date
      if (errors.length === 0) {
        await setStatusLivre({
          docname: colisId,
          confirm: true
        });
      }

      // Marquer comme succès si pas d'erreurs
      if (errors.length === 0) {
        setDeliverySuccess(true);
      }
    } catch (error) {
      console.error('Erreur lors de la livraison:', error);
      
      // Afficher le message d'erreur stylé
      const errorMessage = document.createElement('div');
      errorMessage.className = 'fixed top-4 right-4 z-50 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg shadow-lg dark:bg-red-900/20 dark:border-red-800 dark:text-red-400';
      errorMessage.innerHTML = `
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
          </svg>
          <span class="font-medium">Erreur lors de la confirmation de la livraison</span>
        </div>
      `;
      document.body.appendChild(errorMessage);

      // Supprimer le message d'erreur après 5 secondes
      setTimeout(() => {
        if (errorMessage.parentNode) {
          errorMessage.parentNode.removeChild(errorMessage);
        }
      }, 5000);
    } finally {
      setIsSaving(false);
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
              <span>Livraison du bon</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800">
                <Truck className="w-3 h-3" />
                <span className="text-xs font-medium">Mode Livraison</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-8">
        <div className="mb-3">
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Livraison du bon
          </h1>
          <div className="flex items-center gap-2 mb-2">
            {colisData.name && (
              <button className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/30">
                <Package className="w-3 h-3" />
                <span className="text-xs font-medium">{colisData.name}</span>
              </button>
            )}
            {currentStatus && (
              <Badge 
                variant="outline" 
                className={`text-xs font-medium ${
                  currentStatus === 'Livré' 
                    ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                    : currentStatus === 'Partiellement Livré'
                    ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800'
                    : currentStatus === 'Enlevé'
                    ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
                    : 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-800'
                }`}
              >
                {currentStatus}
              </Badge>
            )}
          </div>
        </div>

        {/* Meta chips */}
        <div className="bg-card rounded-md border border-border shadow-lg p-4 mb-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <MetaChip
              icon={<Package className="w-4 h-4" />}
              label="Séquence"
              value={colisData.custom_numero_sequence || "—"}
            />
            <MetaChip
              icon={<FileText className="w-4 h-4" />}
              label="Client"
              value={colisData.client || "—"}
            />
            <MetaChip
              icon={<FileText className="w-4 h-4" />}
              label="BL"
              value={colisData.bl || "—"}
            />
            <MetaChip
              icon={<Package className="w-4 h-4" />}
              label="Articles"
              value={articleStates.length}
            />
          </div>
        </div>

        {/* Boutons d'action rapide */}
        <div className="flex gap-2 mb-4">
          <Button
            onClick={handleDeliverAll}
            variant="outline"
            size="sm"
            className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/30"
          >
            <CheckCircle className="w-4 h-4 mr-1" />
            Tout Livrer
          </Button>
          <Button
            onClick={handleDeliverNone}
            variant="outline"
            size="sm"
            className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/30"
          >
            <XCircle className="w-4 h-4 mr-1" />
            Non Livré
          </Button>
        </div>

        {/* Articles à livrer */}
        <Card className="p-6 mb-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-foreground">
              Articles à Livrer ({articleStates.length})
            </h3>
          </div>
          
          {/* Version tableau pour desktop */}
          <div className="hidden sm:block">
            <div className="space-y-3">
              {articleStates.map((article) => (
                <div
                  key={article.id}
                  className="flex items-center gap-4 p-4 rounded-lg border bg-card"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <Package className="w-4 h-4" />
                  </div>
                  
                  <div className="flex-1">
                    <div className="font-medium text-foreground">
                      {article.item_code}: <span className="text-sm text-muted-foreground">{article.item_name}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 text-xs">
                      Total: {article.quantite_totale}
                    </Badge>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${
                        article.quantite_restante === 0 
                          ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' 
                          : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                      }`}
                    >
                      Restant: {article.quantite_restante}
                    </Badge>
                    {article.quantite_a_livrer > 0 && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 text-xs">
                        À livrer: {article.quantite_a_livrer}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateArticleQuantity(article.id, Math.max(0, article.quantite_a_livrer - 1))}
                        disabled={article.quantite_a_livrer <= 0}
                        className="h-8 w-8 p-0 rounded-none border-r border-gray-300 hover:bg-gray-100"
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <Input
                        type="number"
                        min="0"
                        max={article.quantite_restante}
                        value={article.quantite_a_livrer}
                        onChange={(e) => updateArticleQuantity(article.id, parseInt(e.target.value) || 0)}
                        className="w-16 h-8 text-center border-0 rounded-none focus:ring-0"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateArticleQuantity(article.id, Math.min(article.quantite_restante, article.quantite_a_livrer + 1))}
                        disabled={article.quantite_a_livrer >= article.quantite_restante}
                        className="h-8 w-8 p-0 rounded-none border-l border-gray-300 hover:bg-gray-100"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    <Button
                      size="sm"
                      onClick={() => updateArticleQuantity(article.id, article.quantite_restante)}
                      disabled={article.quantite_restante === 0}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs px-3"
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Tout
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Version cartes pour mobile */}
          <div className="sm:hidden space-y-3">
            {articleStates.map((article) => (
              <Card key={article.id} className="p-3 border border-border/50 bg-card/30 hover:shadow-md transition-all duration-200">
                <div className="space-y-3">
                  {/* En-tête de l'article */}
                  <div className="flex flex-col gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 font-medium text-sm text-foreground truncate">
                        <Package className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        {article.item_code}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 break-words">
                        {article.item_name}
                      </div>
                    </div>
                    <div className="flex justify-center items-center gap-2 flex-shrink-0">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 text-xs">
                        Total: {article.quantite_totale}
                      </Badge>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${
                          article.quantite_restante === 0 
                            ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' 
                            : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                        }`}
                      >
                        Restant: {article.quantite_restante}
                      </Badge>
                      {article.quantite_a_livrer > 0 && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 text-xs">
                          À livrer: {article.quantite_a_livrer}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="space-y-2">
                    <div className="flex justify-center">
                      <div className="flex items-center border border-gray-300 rounded-md overflow-hidden w-full">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => updateArticleQuantity(article.id, Math.max(0, article.quantite_a_livrer - 1))}
                          disabled={article.quantite_a_livrer <= 0}
                          className="h-8 flex-1 p-0 rounded-none border-r border-gray-300 hover:bg-gray-100"
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <Input
                          type="number"
                          min="0"
                          max={article.quantite_restante}
                          value={article.quantite_a_livrer}
                          onChange={(e) => updateArticleQuantity(article.id, parseInt(e.target.value) || 0)}
                          className="w-16 h-8 text-center border-0 rounded-none focus:ring-0"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => updateArticleQuantity(article.id, Math.min(article.quantite_restante, article.quantite_a_livrer + 1))}
                          disabled={article.quantite_a_livrer >= article.quantite_restante}
                          className="h-8 flex-1 p-0 rounded-none border-l border-gray-300 hover:bg-gray-100"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    
                    {/* Bouton Tout Livré */}
                    <Button
                      size="sm"
                      onClick={() => updateArticleQuantity(article.id, article.quantite_restante)}
                      disabled={article.quantite_restante === 0}
                      className="w-full bg-green-600 hover:bg-green-700 text-white text-xs py-2"
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Tout Livré ({article.quantite_restante})
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Card>

        {/* Preuves de livraison */}
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Preuves de Livraison
          </h3>
          
          <div className="space-y-4">
            {/* Photo */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Photo de Livraison
              </label>
              <div className="flex gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                  id="photo-upload"
                />
                <label
                  htmlFor="photo-upload"
                  className="flex-1 p-3 border border-dashed border-gray-300 rounded-md cursor-pointer hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500"
                >
                  <div className="text-center">
                    <Camera className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {photoFile ? photoFile.name : 'Cliquez pour sélectionner une photo'}
                    </span>
                  </div>
                </label>
              </div>
              {photoPreview && (
                <div className="mt-2">
                  <img
                    src={photoPreview}
                    alt="Aperçu"
                    className="w-32 h-32 object-cover rounded-md border"
                  />
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Messages de statut */}
        {deliveryErrors.length > 0 && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:border-red-800">
            <h3 className="text-red-800 dark:text-red-400 font-medium mb-2">Erreurs de livraison :</h3>
            <ul className="text-red-700 dark:text-red-300 text-sm space-y-1">
              {deliveryErrors.map((error, index) => (
                <li key={index}>• {error}</li>
              ))}
            </ul>
          </div>
        )}

        {deliverySuccess && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg dark:bg-green-900/20 dark:border-green-800">
            <div className="flex items-center gap-2 text-green-800 dark:text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Livraison confirmée avec succès!</span>
            </div>
          </div>
        )}

        {/* Bouton de confirmation - affiché seulement si au moins un article a une quantité à livrer */}
        {articleStates.some(article => article.quantite_a_livrer > 0) && !deliverySuccess && (
          <div className="flex justify-center mt-6">
            <Button 
              onClick={handleConfirmClick}
              disabled={isSaving}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {isSaving ? 'Traitement...' : 'Confirmer la Livraison'}
            </Button>
          </div>
        )}
      </div>

      {/* Dialog de confirmation */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Confirmer la Livraison
            </DialogTitle>
            <DialogDescription className="text-left">
              Êtes-vous sûr de vouloir confirmer la livraison de ce colis ?
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-3">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-sm">Colis:</span>
                <span className="text-sm text-muted-foreground">{colisData.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-sm">Client:</span>
                <span className="text-sm text-muted-foreground">{colisData.client}</span>
              </div>
            </div>
            
            <div className="text-sm text-muted-foreground">
              Cette action enregistrera automatiquement votre position GPS et marquera le colis comme "Livré".
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
              disabled={isSaving}
            >
              Annuler
            </Button>
            <Button
              onClick={submitDelivery}
              disabled={isSaving}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {isSaving ? 'Traitement...' : 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}