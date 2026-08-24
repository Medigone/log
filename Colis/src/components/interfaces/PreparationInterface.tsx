import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Steps } from '@/components/ui/steps';
import { ColisStatusManager } from '@/components/ColisStatusManager';
import { useUserRole } from '@/hooks/useUserRole';
import { useFrappeAuth, useFrappeUpdateDoc } from 'frappe-react-sdk';
import {
  CheckCircle,
  Package,
  FileText,
  IdCard,
  Clock,
  Rows3,
  Circle
} from 'lucide-react';

interface PreparationInterfaceProps {
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
      className="inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md bg-gray-50 text-gray-500 border border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-600"
    >
      <span className="flex items-center justify-center w-4 h-4 text-current shrink-0">
        {icon}
      </span>
      <span className="inline-flex items-center gap-1 sm:gap-1.5 text-current text-xs sm:text-sm min-w-0">
        {label && (
          <span className="font-medium opacity-80 hidden sm:inline">
            {label}
          </span>
        )}
        <span className="font-semibold truncate">{value}</span>
      </span>
    </div>
  );
}

export function PreparationInterface({
  colisData,
  colisId,
  livraisonId,
  onBackToLivraison
}: PreparationInterfaceProps) {
  const { currentUser } = useFrappeAuth();
  const userRole = useUserRole(currentUser);
  const { updateDoc: updateColis } = useFrappeUpdateDoc();
  const [isSaving, setIsSaving] = useState(false);
  const [checkedArticles, setCheckedArticles] = useState<Set<string>>(new Set());

  const handleStatusChange = async (newStatus: string) => {
    if (!colisId) return;
    
    setIsSaving(true);
    try {
      await updateColis("Delivery Note", colisId, { custom_statut: newStatus });
      // Reload page to reflect changes
      window.location.reload();
    } catch (e) {
      console.error(e);
      throw new Error("Erreur lors du changement de statut");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleArticleCheck = (articleId: string) => {
    const newChecked = new Set(checkedArticles);
    if (newChecked.has(articleId)) {
      newChecked.delete(articleId);
    } else {
      newChecked.add(articleId);
    }
    setCheckedArticles(newChecked);
  };

  const allArticlesChecked = colisData.articles?.every((article: any) => 
    checkedArticles.has(article.id || article.name)
  ) || false;

  const markAsPreparé = async () => {
    if (!allArticlesChecked) {
      alert("Veuillez vérifier tous les articles avant de marquer comme préparé");
      return;
    }
    await handleStatusChange('Préparé');
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
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center gap-2 flex-wrap justify-between">
            <div className="inline-flex items-center gap-2 text-muted-foreground text-xs sm:text-sm">
              {livraisonId && onBackToLivraison && (
                <>
                  <button
                    onClick={onBackToLivraison}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/30"
                    title="Retour aux détails de la livraison"
                  >
                    <FileText className="w-3 h-3" />
                    <span className="text-xs font-medium hidden sm:inline">Livraison {livraisonId}</span>
                    <span className="text-xs font-medium sm:hidden">{livraisonId}</span>
                  </button>
                  <Circle className="w-1 h-1 fill-current hidden sm:block" />
                </>
              )}
              <span className="hidden sm:inline">Préparation Colis</span>
            </div>
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
              <Package className="w-3 h-3" />
              <span className="text-xs font-medium hidden sm:inline">Mode Préparateur</span>
              <span className="text-xs font-medium sm:hidden">Préparateur</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-3 sm:px-4 pt-4 sm:pt-6 pb-8">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2 sm:gap-3">
          <h1 className="text-lg sm:text-2xl font-bold text-foreground leading-tight">
            Préparation Colis {colisData.custom_numero_sequence || "—"}
          </h1>
        </div>

        {/* Meta chips */}
        <div className="bg-card rounded-md border border-border shadow-lg p-3 sm:p-4 mb-5">
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
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

        {/* Status Management */}
        <div className="mb-5">
          <ColisStatusManager
            currentStatus={colisData.status || 'Nouveau'}
            onStatusChange={handleStatusChange}
            canChangeStatus={true}
            userRole={userRole}
            isLoading={isSaving}
            hasRemainingQuantities={colisData.articles?.some((a: any) => a.quantite_restante > 0)}
          />
        </div>

        {/* Preparation Checklist */}
        <Card className="p-4 sm:p-6 mb-6">
          <div className="flex items-center justify-between mb-4 gap-2">
            <h2 className="text-base sm:text-lg font-semibold text-foreground leading-tight">
              <span className="block sm:inline">Liste de Préparation</span>
              <span className="block sm:inline text-sm sm:text-base text-muted-foreground sm:text-foreground">({colisData.articles?.length || 0} articles)</span>
            </h2>
            <div className="text-sm text-muted-foreground shrink-0">
              {checkedArticles.size} / {colisData.articles?.length || 0}
              <span className="hidden sm:inline"> vérifiés</span>
            </div>
          </div>

          <div className="space-y-3">
            {colisData.articles?.map((article: any, index: number) => {
              const articleId = article.id || article.name || `article-${index}`;
              const isChecked = checkedArticles.has(articleId);
              
              return (
                <div
                  key={articleId}
                  className={`flex items-center gap-3 p-3 sm:gap-4 sm:p-4 rounded-lg border transition-colors ${
                    isChecked 
                      ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' 
                      : 'bg-card border-border hover:bg-muted/50'
                  }`}
                >
                  <button
                    onClick={() => toggleArticleCheck(articleId)}
                    className={`flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all shrink-0 ${
                      isChecked
                        ? 'bg-green-600 border-green-600 text-white'
                        : 'border-gray-300 hover:border-green-400'
                    }`}
                  >
                    {isChecked && <CheckCircle className="w-4 h-4" />}
                  </button>
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground text-sm sm:text-base truncate">
                      {article.article}
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground">
                      Quantité totale: {article.quantite_totale}
                    </div>
                  </div>

                  <div className={`px-2 sm:px-3 py-1 rounded-md text-xs font-medium shrink-0 ${
                    isChecked
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  }`}>
                    {isChecked ? 'Vérifié' : 'À vérifier'}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Preparation Actions */}
        <Card className="p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-foreground mb-4">
            Finaliser la Préparation
          </h3>
          
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Une fois tous les articles vérifiés et emballés, marquez le colis comme préparé.
            </div>
            
            <Button
              onClick={markAsPreparé}
              disabled={!allArticlesChecked || isSaving}
              className="bg-green-600 hover:bg-green-700 text-white px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base w-full sm:w-auto"
            >
              <Package className="w-4 sm:w-5 h-4 sm:h-5 mr-2" />
              {isSaving ? 'Mise à jour...' : 'Marquer comme Préparé'}
            </Button>
            
            {!allArticlesChecked && (
              <div className="text-sm text-yellow-600 dark:text-yellow-400">
                ⚠️ Veuillez vérifier tous les articles avant de continuer
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}