import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFrappeAuth, useFrappePostCall } from 'frappe-react-sdk';
import {
  Truck,
  Package,
  FileText,
  IdCard,
  Clock,
  Rows3,
  CheckCircle,
} from 'lucide-react';

interface PickupInterfaceProps {
  colisData: any;
  colisId: string;
  livraisonId?: string;
  onBackToLivraison?: () => void;
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

export function PickupInterface({
  colisData,
  colisId,
  livraisonId,
  onBackToLivraison
}: PickupInterfaceProps) {
  const { } = useFrappeAuth();
  const { call: setStatusEnleve } = useFrappePostCall('log.log.doctype.colis.colis.set_status_enleve');
  const [isSaving, setIsSaving] = useState(false);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [articleVerifications, setArticleVerifications] = useState<{[key: string]: boolean}>({});

  // Fonction pour basculer la vérification d'un article
  const toggleArticleVerification = (articleId: string) => {
    setArticleVerifications(prev => {
      const newVerifications = {
        ...prev,
        [articleId]: !prev[articleId]
      };
      
      // Vérifier si tous les articles sont maintenant vérifiés
      const allVerified = colisData.articles?.every((article: any) => 
        newVerifications[article.id || article.name || `article-${colisData.articles.indexOf(article)}`]
      );
      
      // Cocher automatiquement la vérification générale si tous les articles sont vérifiés
      // Décocher automatiquement si un article est décoché
      setVerificationComplete(allVerified);
      
      return newVerifications;
    });
  };

  // Vérifier si tous les articles sont vérifiés
  const allArticlesVerified = () => {
    if (!colisData.articles || colisData.articles.length === 0) return false;
    return colisData.articles.every((article: any) => 
      articleVerifications[article.id || article.name || `article-${colisData.articles.indexOf(article)}`]
    );
  };

  const confirmPickup = async () => {
    if (!verificationComplete || !allArticlesVerified()) {
      alert("Veuillez vérifier le colis et tous les articles avant de confirmer l'enlèvement");
      return;
    }
    
    setIsSaving(true);
    try {
      // Utiliser l'API backend pour mettre à jour le statut avec l'utilisateur et la date
      await setStatusEnleve({
        docname: colisId,
        confirm: true
      });
      
      // Reload page to reflect changes
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la confirmation de l'enlèvement");
    } finally {
      setIsSaving(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleDateString("fr-FR", {
        year: "numeric",
        month: "long",
        day: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap justify-between">
            <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
              <span>Enlèvement Colis</span>
            </div>
            <div className="flex items-center gap-3">
              {livraisonId && onBackToLivraison && (
                <button
                  onClick={onBackToLivraison}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/30"
                  title="Retour aux détails de la livraison"
                >
                  <FileText className="w-3 h-3" />
                  <span className="text-xs font-medium">Livraison {livraisonId}</span>
                </button>
              )}
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                <Truck className="w-3 h-3" />
                <span className="text-xs font-medium">Mode Livreur</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-8">
        <div className="mb-3">
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Enlèvement Colis
          </h1>
          {colisData.name && (
            <button className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/30">
              <Package className="w-3 h-3" />
              <span className="text-xs font-medium">{colisData.name}</span>
            </button>
          )}
        </div>

        {/* Meta chips */}
        <div className="bg-card rounded-md border border-border shadow-lg p-4 mb-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <MetaChip
              icon={<Rows3 className="w-4 h-4" />}
              label="Séquence"
              value={colisData.custom_numero_sequence || "—"}
            />
            <MetaChip
              icon={<IdCard className="w-4 h-4" />}
              label="Client"
              value={colisData.client || "—"}
            />
            <MetaChip
              icon={<FileText className="w-4 h-4" />}
              label="BL"
              value={colisData.bl || "—"}
            />
            <MetaChip
              icon={<Clock className="w-4 h-4" />}
              label="Créé le"
              value={formatDate(colisData.date_creation)}
            />
          </div>
        </div>



        {/* Package Contents */}
        <Card className="p-6 mb-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Contenu du Colis ({colisData.articles?.length || 0} articles)
          </h3>
          
          {/* Version desktop */}
          <div className="hidden sm:block space-y-3">
            {colisData.articles?.map((article: any, index: number) => {
              const articleId = article.id || article.name || `article-${index}`;
              const isVerified = articleVerifications[articleId];
              
              return (
                <div
                  key={articleId}
                  className={`flex items-center gap-4 p-4 rounded-lg border bg-card transition-colors ${
                    isVerified ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10' : ''
                  }`}
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                    <Package className="w-4 h-4" />
                  </div>
                  
                  <div className="flex-1 flex items-center gap-3">
                    <div className="font-medium text-foreground">
                      {article.article}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {article.item_name || article.article}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      Quantité: {article.quantite_totale}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleArticleVerification(articleId)}
                      className={`flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all ${
                        isVerified
                          ? 'bg-green-600 border-green-600 text-white'
                          : 'border-gray-300 hover:border-green-400'
                      }`}
                    >
                      {isVerified && <CheckCircle className="w-4 h-4" />}
                    </button>
                    
                    <div className="px-3 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      Préparé
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Version mobile */}
          <div className="sm:hidden space-y-3">
            {colisData.articles?.map((article: any, index: number) => {
              const articleId = article.id || article.name || `article-${index}`;
              const isVerified = articleVerifications[articleId];
              
              return (
                <Card 
                  key={articleId}
                  className={`p-3 border border-border/50 bg-card/30 hover:shadow-md transition-all duration-200 ${
                    isVerified ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10' : ''
                  }`}
                >
                  <div className="space-y-3">
                    {/* En-tête de l'article */}
                    <div className="flex flex-col gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-foreground truncate">
                          {article.article}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 break-words">
                          {article.item_name || article.article}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 text-xs">
                          Quantité: {article.quantite_totale}
                        </Badge>
                        <div className="px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          Préparé
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Vérifier l'article
                      </div>
                      <button
                        onClick={() => toggleArticleVerification(articleId)}
                        className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all ${
                          isVerified
                            ? 'bg-green-600 border-green-600 text-white'
                            : 'border-gray-300 hover:border-green-400'
                        }`}
                      >
                        {isVerified && <CheckCircle className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </Card>

        {/* Verification and Pickup */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Vérification et Enlèvement
          </h3>
          
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <button
                onClick={() => {
                  const newVerificationComplete = !verificationComplete;
                  setVerificationComplete(newVerificationComplete);
                  
                  if (newVerificationComplete) {
                    // Si on coche la vérification générale, cocher tous les articles
                    const allArticlesVerified: {[key: string]: boolean} = {};
                    colisData.articles?.forEach((article: any, index: number) => {
                      const articleId = article.id || article.name || `article-${index}`;
                      allArticlesVerified[articleId] = true;
                    });
                    setArticleVerifications(allArticlesVerified);
                  } else {
                    // Si on décoche la vérification générale, décocher tous les articles
                    setArticleVerifications({});
                  }
                }}
                className={`flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all mt-1 ${
                  verificationComplete
                    ? 'bg-green-600 border-green-600 text-white'
                    : 'border-gray-300 hover:border-green-400'
                }`}
              >
                {verificationComplete && <CheckCircle className="w-4 h-4" />}
              </button>
              
              <div className="flex-1">
                <div className="font-medium text-foreground">
                  J'ai vérifié le contenu du colis
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  Vérifiez que tous les articles listés sont présents et correctement emballés
                </div>
              </div>
            </div>
            
            <div className="pt-4 border-t border-border">
              <Button
                onClick={confirmPickup}
                disabled={!verificationComplete || !allArticlesVerified() || isSaving}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 text-sm"
              >
                <Truck className="w-4 h-4 mr-2" />
                {isSaving ? 'Mise à jour...' : 'Confirmer l\'Enlèvement'}
              </Button>
              
              {(!verificationComplete || !allArticlesVerified()) && (
                <div className="text-sm text-amber-600 dark:text-amber-400 mt-2 text-center">
                  ⚠️ Veuillez vérifier le colis et tous les articles avant de confirmer l'enlèvement
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}