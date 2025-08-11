import React, { useState } from "react";
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
import { CreditCard, AlertTriangle, Upload } from "lucide-react";
import {
  useFrappeCreateDoc,
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeAuth,
  useFrappeUpdateDoc,
  useFrappeFileUpload
} from "frappe-react-sdk";

interface PaiementClientDialogProps {
  livraisonId: string;
  clientId?: string;
  clientName?: string;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
}

const PaiementClientDialog: React.FC<PaiementClientDialogProps> = ({
  livraisonId,
  clientId,
  clientName,
  onSuccess,
  trigger
}) => {
  const [open, setOpen] = useState(false);
  const [bonDeLivraison, setBonDeLivraison] = useState("");
  const [selectedBon, setSelectedBon] = useState<any>(null);
  const [client, setClient] = useState(clientId || "");
  const [moyenPaiement, setMoyenPaiement] = useState("");
  const [montant, setMontant] = useState("");
  const [dateEncaissement, setDateEncaissement] = useState("");
  const [recu, setRecu] = useState<File | null>(null);
  const [photoCheque, setPhotoCheque] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { createDoc } = useFrappeCreateDoc();
  const { updateDoc } = useFrappeUpdateDoc();
  const { upload } = useFrappeFileUpload();
  const { currentUser } = useFrappeAuth();
  
  // Récupérer les bons de livraison liés à cette livraison
  // La liaison se fait par la date de livraison, pas par un champ direct
  const { data: livraisonData } = useFrappeGetDoc("Livraison", livraisonId);
  const { data: bonsDeLivraison, error: bonsDeLivraisonError } = useFrappeGetDocList(
    "Delivery Note",
    {
      fields: ["name", "customer", "customer_name", "grand_total"],
      filters: livraisonData?.date_liv ? [["custom_date_de_livraison", "=", livraisonData.date_liv]] : [],
      limit: 100,
    }
  );

  const handleSubmit = async () => {
    if (!montant || parseFloat(montant) <= 0) {
      setError("Veuillez saisir un montant valide");
      return;
    }
    if (!client) {
      setError("Veuillez sélectionner un client");
      return;
    }
    if (!bonDeLivraison) {
      setError("Veuillez sélectionner un bon de livraison");
      return;
    }
    if (!moyenPaiement) {
      setError("Veuillez sélectionner un moyen de paiement");
      return;
    }
    if (moyenPaiement === "Espèce" && !recu) {
      setError("Le reçu de paiement est obligatoire pour les paiements en espèce");
      return;
    }
    if (moyenPaiement === "Chèque" && (!photoCheque || !dateEncaissement)) {
      setError("La photo du chèque et la date d'encaissement sont obligatoires");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 1) Créer le document sans les fichiers et sans date (gérés par Frappe)
      const payload: any = {
        livraison: livraisonId,
        bon_livraison: bonDeLivraison,
        client: client,
        montant: parseFloat(montant),
        moyen_paiement: moyenPaiement,
        id_beneficiaire: currentUser || "Administrator",
        ...(moyenPaiement === "Chèque" && dateEncaissement
          ? { date_encaissement: dateEncaissement }
          : {})
      };

      // Nettoyer le payload des champs undefined/null
      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
          delete payload[key];
        }
      });

      console.log('Payload envoyé:', payload);

      const created = await createDoc("Paiement Client", payload);

      // 2) Upload des fichiers si nécessaires
       // a) Espèce → reçu
       if (moyenPaiement === "Espèce" && recu instanceof File) {
         const uploadResult = await upload(recu, {
           doctype: "Paiement Client",
           docname: created.name,
           fieldname: "recu"
         });
         
         // Mettre à jour le document avec l'URL du fichier
         if (uploadResult && uploadResult.file_url) {
           await updateDoc("Paiement Client", created.name, {
             recu: uploadResult.file_url
           });
         }
       }

       // b) Chèque → photo
       if (moyenPaiement === "Chèque" && photoCheque instanceof File) {
         const uploadResult = await upload(photoCheque, {
           doctype: "Paiement Client",
           docname: created.name,
           fieldname: "photo_cheque"
         });
         
         // Mettre à jour le document avec l'URL du fichier
         if (uploadResult && uploadResult.file_url) {
           await updateDoc("Paiement Client", created.name, {
             photo_cheque: uploadResult.file_url
           });
         }
       }

      // Reset form
      setClient(clientId || "");
      setBonDeLivraison("");
      setMontant("");
      setMoyenPaiement("");
      setDateEncaissement("");
      setRecu(null);
      setPhotoCheque(null);
      
      // Call success callback first
      if (onSuccess) {
        onSuccess();
      }
      
      // Close dialog after a small delay to prevent navigation issues
      setTimeout(() => {
        setOpen(false);
      }, 100);
    } catch (err: any) {
      console.error("Frappe error raw:", err);
      console.error("Frappe error message:", err?.message);
      console.error("Frappe error exc:", err?.exc);
      setError(err?.message || "Erreur lors de la création du paiement");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset form when closing
      setClient(clientId || "");
      setBonDeLivraison("");
      setMontant("");
      setMoyenPaiement("");
      setDateEncaissement("");
      setRecu(null);
      setPhotoCheque(null);
      setError(null);
    }
    setOpen(newOpen);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'recu' | 'cheque') => {
    const file = e.target.files?.[0];
    if (file) {
      if (type === 'recu') {
        setRecu(file);
      } else {
        setPhotoCheque(file);
      }
    }
  };

  const handleBonDeLivraisonChange = (bonId: string) => {
    setBonDeLivraison(bonId);
    // Trouver le bon sélectionné et stocker ses données
    const selectedBonData = bonsDeLivraison?.find((bon: any) => bon.name === bonId);
    setSelectedBon(selectedBonData);
    // Auto-remplir le client si disponible
    if (selectedBonData && !clientId) {
      setClient(selectedBonData.customer || "");
    }
  };

  // Fonction pour formater le montant
  const formatAmount = (amount: number | undefined) => {
    if (!amount) return "0,00 DZD";
    return new Intl.NumberFormat('fr-DZ', {
      style: 'currency',
      currency: 'DZD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="h-10 px-3 text-xs border-blue-500 hover:bg-blue-50 w-full">
            <CreditCard className="w-3 h-3 mr-1" />
            Saisir paiement
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="bg-card rounded-2xl border border-border shadow-2xl max-w-md">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Nouveau paiement client
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Enregistrer un paiement pour cette livraison
          </DialogDescription>
        </DialogHeader>
        
        <div className="p-4 space-y-4">
          {error && (
            <Alert className="border-red-500/50 bg-red-500/10">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <AlertDescription className="text-red-200">
                {error}
              </AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Bon de livraison *
            </label>
            <Select value={bonDeLivraison} onValueChange={handleBonDeLivraisonChange} disabled={isSubmitting}>
              <SelectTrigger className="h-9 px-3 text-xs">
                <SelectValue placeholder="Sélectionner un bon de livraison" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {bonsDeLivraison?.map((bon: any) => (
                  <SelectItem key={bon.name} value={bon.name}>
                    {bon.name} - {bon.customer_name || bon.customer} ({formatAmount(bon.grand_total)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBon && (
              <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-blue-700 dark:text-blue-300 font-medium">Montant total du bon :</span>
                  <span className="text-blue-900 dark:text-blue-100 font-semibold">{formatAmount(selectedBon.grand_total)}</span>
                </div>
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Client *
            </label>
            <Input
              placeholder="ID du client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              disabled={isSubmitting || !!clientId}
              className="h-9 px-3 text-xs"
            />
            {clientName && (
              <p className="text-xs text-muted-foreground">{clientName}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Moyen de paiement *
            </label>
            <Select value={moyenPaiement} onValueChange={setMoyenPaiement} disabled={isSubmitting}>
              <SelectTrigger className="h-9 px-3 text-xs">
                <SelectValue placeholder="Sélectionner un moyen de paiement" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="Espèce">Espèce</SelectItem>
                <SelectItem value="Chèque">Chèque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Montant (DA) *
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              disabled={isSubmitting}
              className="h-9 px-3 text-xs"
            />
          </div>
          
          {moyenPaiement === "Espèce" && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Reçu de paiement *
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e, 'recu')}
                  disabled={isSubmitting}
                  className="h-9 px-3 text-xs"
                />
                <Upload className="w-4 h-4 text-muted-foreground" />
              </div>
              {recu && (
                <p className="text-xs text-muted-foreground">Fichier sélectionné: {recu.name}</p>
              )}
            </div>
          )}
          
          {moyenPaiement === "Chèque" && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Photo du chèque *
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileChange(e, 'cheque')}
                    disabled={isSubmitting}
                    className="h-9 px-3 text-xs"
                  />
                  <Upload className="w-4 h-4 text-muted-foreground" />
                </div>
                {photoCheque && (
                  <p className="text-xs text-muted-foreground">Fichier sélectionné: {photoCheque.name}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Date d'encaissement *
                </label>
                <Input
                  type="date"
                  value={dateEncaissement}
                  onChange={(e) => setDateEncaissement(e.target.value)}
                  disabled={isSubmitting}
                  className="h-9 px-3 text-xs"
                />
              </div>
            </>
          )}
        </div>
        
        <DialogFooter className="px-4 py-3 border-t border-border gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
            className="h-9 px-3 text-xs"
          >
            Annuler
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !montant || !client || !moyenPaiement}
            className="h-9 px-3 text-xs border-blue-500 hover:bg-blue-50"
          >
            {isSubmitting ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PaiementClientDialog;