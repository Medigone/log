import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Edit, Trash2, AlertTriangle, Upload } from "lucide-react";
import {
  useFrappeUpdateDoc,
  useFrappeDeleteDoc,
  useFrappeFileUpload,
  useFrappeGetDoc
} from "frappe-react-sdk";

interface PaiementActionsDialogProps {
  paiement: {
    name: string;
    client: string;
    nom_client?: string;
    montant: number;
    moyen_paiement: string;
    date: string;
    date_encaissement?: string;
    recu?: string;
    photo_cheque?: string;
    bon_livraison?: string;
  };
  onSuccess?: () => void;
  trigger?: React.ReactNode;
}

const PaiementActionsDialog: React.FC<PaiementActionsDialogProps> = ({
  paiement,
  onSuccess,
  trigger
}) => {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'edit' | 'delete'>('edit');
  const [montant, setMontant] = useState(paiement.montant.toString());
  const [moyenPaiement, setMoyenPaiement] = useState(paiement.moyen_paiement);
  const [dateEncaissement, setDateEncaissement] = useState(paiement.date_encaissement || "");
  const [recu, setRecu] = useState<File | null>(null);
  const [photoCheque, setPhotoCheque] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { updateDoc } = useFrappeUpdateDoc();
  const { deleteDoc } = useFrappeDeleteDoc();
  const { upload } = useFrappeFileUpload();
  
  // Récupérer les données du bon de livraison si disponible
  const { data: bonDeLivraisonData } = useFrappeGetDoc(
    "Delivery Note", 
    paiement.bon_livraison || "",
    paiement.bon_livraison ? undefined : { enabled: false }
  );
  

  
  // Fonction pour formater le montant
  const formatAmount = (amount: number | undefined) => {
    if (!amount) return "0,00 DZD";
    return new Intl.NumberFormat('fr-DZ', {
      style: 'currency',
      currency: 'DZD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setMontant(paiement.montant.toString());
      setMoyenPaiement(paiement.moyen_paiement);
      setDateEncaissement(paiement.date_encaissement || "");
      setRecu(null);
      setPhotoCheque(null);
      setError(null);
    }
  }, [open, paiement]);

  const handleEdit = async () => {
    if (!montant || parseFloat(montant) <= 0) {
      setError("Veuillez saisir un montant valide");
      return;
    }
    if (!moyenPaiement) {
      setError("Veuillez sélectionner un moyen de paiement");
      return;
    }
    if (moyenPaiement === "Chèque" && !dateEncaissement) {
      setError("La date d'encaissement est obligatoire pour les chèques");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Préparer les données de mise à jour
      const updateData: any = {
        montant: parseFloat(montant),
        moyen_paiement: moyenPaiement,
        ...(moyenPaiement === "Chèque" && dateEncaissement
          ? { date_encaissement: dateEncaissement }
          : {})
      };

      // Nettoyer le payload
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined || updateData[key] === null || updateData[key] === '') {
          delete updateData[key];
        }
      });

      // Mettre à jour le document
      await updateDoc("Paiement Client", paiement.name, updateData);

      // Upload des nouveaux fichiers si fournis
      if (moyenPaiement === "Espèce" && recu instanceof File) {
        const uploadResult = await upload(recu, {
          doctype: "Paiement Client",
          docname: paiement.name,
          fieldname: "recu"
        });
        
        if (uploadResult && uploadResult.file_url) {
          await updateDoc("Paiement Client", paiement.name, {
            recu: uploadResult.file_url
          });
        }
      }

      if (moyenPaiement === "Chèque" && photoCheque instanceof File) {
        const uploadResult = await upload(photoCheque, {
          doctype: "Paiement Client",
          docname: paiement.name,
          fieldname: "photo_cheque"
        });
        
        if (uploadResult && uploadResult.file_url) {
          await updateDoc("Paiement Client", paiement.name, {
            photo_cheque: uploadResult.file_url
          });
        }
      }

      setOpen(false);
      onSuccess?.();
    } catch (err: any) {
      console.error('Erreur lors de la modification:', err);
      setError(err.message || "Erreur lors de la modification du paiement");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      await deleteDoc("Paiement Client", paiement.name);
      setOpen(false);
      onSuccess?.();
    } catch (err: any) {
      console.error('Erreur lors de la suppression:', err);
      setError(err.message || "Erreur lors de la suppression du paiement");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'recu' | 'photo_cheque') => {
    const file = e.target.files?.[0];
    if (file) {
      if (type === 'recu') {
        setRecu(file);
      } else {
        setPhotoCheque(file);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="h-8 w-8 p-0 hover:bg-blue-50 border-blue-200">
            <Edit className="w-4 h-4 text-blue-600" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-card rounded-2xl border border-border shadow-2xl">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
            {mode === 'edit' ? (
              <><Edit className="w-5 h-5" /> Modifier le paiement</>
            ) : (
              <><Trash2 className="w-5 h-5" /> Supprimer le paiement</>
            )}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {mode === 'edit' 
              ? `Modification du paiement de ${paiement.nom_client || paiement.client}`
              : `Êtes-vous sûr de vouloir supprimer ce paiement de ${paiement.nom_client || paiement.client} ?`
            }
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert className="border-red-500/50 bg-red-500/10">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-200">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {mode === 'edit' ? (
          <div className="p-4 space-y-4">
            {/* Affichage du montant total du bon de livraison */}
            {bonDeLivraisonData && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-blue-700 dark:text-blue-300 font-medium">Montant total du bon :</span>
                  <span className="text-blue-900 dark:text-blue-100 font-semibold">{formatAmount(bonDeLivraisonData.grand_total)}</span>
                </div>
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  Bon : {paiement.bon_livraison}
                </div>
              </div>
            )}
            
            {/* Montant */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Montant (DA)</label>
              <Input
                type="number"
                step="0.01"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                placeholder="0.00"
                className="h-9 px-3 text-xs"
              />
            </div>

            {/* Moyen de paiement */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Moyen de paiement</label>
              <Select value={moyenPaiement} onValueChange={setMoyenPaiement}>
                <SelectTrigger className="h-9 px-3 text-xs">
                  <SelectValue placeholder="Sélectionner un moyen" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="Espèce">Espèce</SelectItem>
                  <SelectItem value="Chèque">Chèque</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date d'encaissement pour chèque */}
            {moyenPaiement === "Chèque" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Date d'encaissement</label>
                <Input
                  type="date"
                  value={dateEncaissement}
                  onChange={(e) => setDateEncaissement(e.target.value)}
                  className="h-9 px-3 text-xs"
                />
              </div>
            )}

            {/* Upload reçu pour espèce */}
            {moyenPaiement === "Espèce" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Nouveau reçu (optionnel)</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => handleFileChange(e, 'recu')}
                    className="h-9 px-3 text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-muted file:text-muted-foreground"
                  />
                  {paiement.recu && (
                    <a
                      href={paiement.recu}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline"
                    >
                      Voir actuel
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Upload photo chèque */}
            {moyenPaiement === "Chèque" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Nouvelle photo du chèque (optionnel)</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileChange(e, 'photo_cheque')}
                    className="h-9 px-3 text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-muted file:text-muted-foreground"
                  />
                  {paiement.photo_cheque && (
                    <a
                      href={paiement.photo_cheque}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline"
                    >
                      Voir actuelle
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4">
            <p className="text-sm text-muted-foreground">
              Cette action est irréversible. Le paiement de <strong>{montant} DA</strong> sera définitivement supprimé.
            </p>
          </div>
        )}

        <DialogFooter className="px-4 py-3 border-t border-border gap-2">
          {mode === 'edit' ? (
            <>
              <Button
                variant="outline"
                onClick={() => setMode('delete')}
                className="h-9 px-3 text-xs border-red-500 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Supprimer
              </Button>
              <Button
                onClick={handleEdit}
                disabled={isSubmitting}
                className="h-9 px-3 text-xs border-blue-500 hover:bg-blue-50"
              >
                {isSubmitting ? "Modification..." : "Modifier"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setMode('edit')}
                disabled={isSubmitting}
                className="h-9 px-3 text-xs"
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="h-9 px-3 text-xs border-red-500 hover:bg-red-50"
              >
                {isSubmitting ? "Suppression..." : "Supprimer"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PaiementActionsDialog;