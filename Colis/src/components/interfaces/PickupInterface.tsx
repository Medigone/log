import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFrappeAuth, useFrappeUpdateDoc } from 'frappe-react-sdk';
import {
  Truck,
  Package,
  FileText,
  IdCard,
  Clock,
  Rows3,
  Circle,
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
  const { currentUser } = useFrappeAuth();
  const { updateDoc: updateColis } = useFrappeUpdateDoc();
  const [isSaving, setIsSaving] = useState(false);
  const [verificationComplete, setVerificationComplete] = useState(false);


  const confirmPickup = async () => {
    if (!verificationComplete) {
      alert("Veuillez vérifier le colis avant de confirmer l'enlèvement");
      return;
    }
    
    setIsSaving(true);
    try {
      // Mettre à jour le statut et l'utilisateur d'enlèvement
      await updateColis("Colis", colisId, { 
        status: 'Enlevé',
        enlevement_user: (currentUser as any)?.full_name || currentUser || 'Utilisateur inconnu'
      });
      // Reload page to reflect changes
      window.location.reload();
    } catch (e) {
      console.error(e);
      throw new Error("Erreur lors de la confirmation de l'enlèvement");
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
          
          <div className="space-y-3">
            {colisData.articles?.map((article: any, index: number) => (
              <div
                key={article.id || article.name || `article-${index}`}
                className="flex items-center gap-4 p-4 rounded-lg border bg-card"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                  <Package className="w-4 h-4" />
                </div>
                
                <div className="flex-1">
                  <div className="font-medium text-foreground">
                    {article.article}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Quantité: {article.quantite_totale}
                  </div>
                </div>

                <div className="px-3 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  Préparé
                </div>
              </div>
            ))}
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
                onClick={() => setVerificationComplete(!verificationComplete)}
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
                disabled={!verificationComplete || isSaving}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-4 text-lg"
              >
                <Truck className="w-5 h-5 mr-2" />
                {isSaving ? 'Mise à jour...' : 'Confirmer l\'Enlèvement'}
              </Button>
              
              {!verificationComplete && (
                <div className="text-sm text-amber-600 dark:text-amber-400 mt-2 text-center">
                  ⚠️ Veuillez vérifier le colis avant de confirmer l'enlèvement
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}