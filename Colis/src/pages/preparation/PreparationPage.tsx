import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import {
  Package,
  FileText,
  Search,
  User,
  Calendar,
  Clipboard,
  AlertTriangle,
  CheckCircle,
  Clock,
  Circle,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk';


/* =========================
   Types
   ========================= */
interface UnpackedDeliveryNote {
  name: string;
  customer: string;
  posting_date: string;
  grand_total: number;
  total_qty: number;
  unpacked_items_count: number;
}

interface DeliveryNoteItem {
  item_code: string;
  item_name: string;
  total_quantity: number;
  used_quantity: number;
  available_quantity: number;
  uom: string;
  rate: number;
}

interface DeliveryNoteInfo {
  name: string;
  customer: string;
  posting_date: string;
  grand_total: number;
  total_qty: number;
}



// Virtual package item for real-time preview
interface VirtualPackageItem {
  item_code: string;
  item_name: string;
  quantity: number;
  uom: string;
  bon_de_livraison: string;
}

// Remaining quantities tracking
interface RemainingQuantities {
  [key: string]: { // key format: "${bon_de_livraison}-${item_code}"
    available: number;
    total: number;
  };
}

interface PreparationPageProps {
  onBack?: () => void;
}

/* =========================
   Helpers
   ========================= */
function formatDate(dateStr?: string) {
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
}

function formatAmount(amount: number | undefined) {
  if (!amount) return "0,00 DZD";
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount) + ' DZD';
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

// Composant pour une ligne d'article - version responsive (tableau sur desktop, carte sur mobile)
function ArticleRow({ 
  item, 
  bonDeLivraison, 
  remainingQuantity, 
  onAddToPackage,
  virtualPackage,
  canAddToPackage
}: { 
  item: any;
  bonDeLivraison: string;
  remainingQuantity: number;
  onAddToPackage: (itemCode: string, itemName: string, quantity: number, uom: string, bonDeLivraison: string) => void;
  virtualPackage: VirtualPackageItem[];
  canAddToPackage: boolean;
}) {
  const [quantity, setQuantity] = useState(1);

  const handleAdd = () => {
    if (quantity > 0 && quantity <= remainingQuantity && canAddToPackage) {
      onAddToPackage(item.item_code, item.item_name, quantity, item.uom, bonDeLivraison);
      setQuantity(1);
    }
  };

  return (
    <>
      {/* Version tableau pour desktop */}
      <TableRow className={`hidden sm:table-row ${!canAddToPackage && virtualPackage.length > 0 ? 'opacity-50' : ''}`}>
        <TableCell className="font-medium">{item.item_code}</TableCell>
        <TableCell>{item.item_name}</TableCell>
        <TableCell className="text-center">{item.total_quantity}</TableCell>
        <TableCell className="text-center">
          <span className={remainingQuantity === 0 ? 'text-green-600 font-medium' : 'text-red-500'}>
            {remainingQuantity}
          </span>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="1"
              max={remainingQuantity}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              className="w-20"
              disabled={remainingQuantity === 0 || !canAddToPackage}
            />
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={remainingQuantity === 0 || quantity > remainingQuantity || !canAddToPackage}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1"
              title={!canAddToPackage && virtualPackage.length > 0 ? `Cet article appartient à un autre bon de livraison. Le colis actuel contient des articles du bon ${virtualPackage[0].bon_de_livraison}.` : ''}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {/* Version carte pour mobile */}
      <div className={`sm:hidden ${!canAddToPackage && virtualPackage.length > 0 ? 'opacity-50' : ''}`}>
        <Card className="p-3 border border-border/50 bg-card/30 hover:shadow-md transition-all duration-200">
          <div className="space-y-3">
            {/* En-tête de l'article */}
            <div className="flex flex-col gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-foreground truncate">
                  {item.item_code}
                </div>
                <div className="text-xs text-muted-foreground mt-1 break-words">
                  {item.item_name}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 text-xs">
                  Total: {item.total_quantity}
                </Badge>
                <Badge 
                  variant="outline" 
                  className={`text-xs ${
                    remainingQuantity === 0 
                      ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' 
                      : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                  }`}
                >
                  Restant: {remainingQuantity}
                </Badge>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="1"
                max={remainingQuantity}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-20"
                disabled={remainingQuantity === 0 || !canAddToPackage}
                placeholder="Qté"
              />
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={remainingQuantity === 0 || quantity > remainingQuantity || !canAddToPackage}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 flex-1"
                title={!canAddToPackage && virtualPackage.length > 0 ? `Cet article appartient à un autre bon de livraison. Le colis actuel contient des articles du bon ${virtualPackage[0].bon_de_livraison}.` : ''}
              >
                <Plus className="w-4 h-4 mr-1" />
                Ajouter
              </Button>
            </div>

            {/* Message d'avertissement si article non compatible */}
            {!canAddToPackage && virtualPackage.length > 0 && (
              <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded border border-amber-200 dark:border-amber-800">
                ⚠️ Cet article appartient à un autre bon de livraison. Le colis actuel contient des articles du bon {virtualPackage[0].bon_de_livraison}.
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

export function PreparationPage({ }: PreparationPageProps) {
  const [searchParams] = useSearchParams();
  const livraisonParam = searchParams.get('livraison');

  
  // LocalStorage key for persistence - include livraison ID to separate data
  const STORAGE_KEY = `preparationPageState_${livraisonParam || 'default'}`;
  
  // Load initial state from localStorage
  const loadStateFromStorage = () => {
    try {
      const savedState = localStorage.getItem(STORAGE_KEY);
      if (savedState) {
        const parsed = JSON.parse(savedState);
        // Validate that the saved state is not too old (optional - 24 hours)
        const now = new Date().getTime();
        const savedTime = parsed.timestamp || 0;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        
        if (now - savedTime < maxAge) {
          return parsed;
        } else {
          // State is too old, clear it
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      console.warn('Failed to load state from localStorage:', error);
      localStorage.removeItem(STORAGE_KEY);
    }
    return null;
  };
  
  const savedState = loadStateFromStorage();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeliveryNote, setSelectedDeliveryNote] = useState<string | null>(
    savedState?.selectedDeliveryNote || null
  );
  const [virtualPackage, setVirtualPackage] = useState<VirtualPackageItem[]>(
    savedState?.virtualPackage || []
  );
  const [remainingQuantities, setRemainingQuantities] = useState<RemainingQuantities>(
    savedState?.remainingQuantities || {}
  );
  const [collapsedDeliveryNotes, setCollapsedDeliveryNotes] = useState<Set<string>>(
    new Set(savedState?.collapsedDeliveryNotes || [])
  );
  const [isCreating, setIsCreating] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Function to save state to localStorage
  const saveStateToStorage = () => {
    try {
      const stateToSave = {
        timestamp: new Date().getTime(),
        selectedDeliveryNote,
        virtualPackage,
        remainingQuantities,
        collapsedDeliveryNotes: Array.from(collapsedDeliveryNotes),
        livraisonParam
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (error) {
      console.warn('Failed to save state to localStorage:', error);
    }
  };
  
  // Function to clear saved state
  const clearSavedState = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear saved state:', error);
    }
  };



  // Effect to automatically save state to localStorage when important state changes
  useEffect(() => {
    // Only save if we have some meaningful data (not initial empty state)
    if (virtualPackage.length > 0 || selectedDeliveryNote || Object.keys(remainingQuantities).length > 0) {
      saveStateToStorage();
    }
  }, [
    selectedDeliveryNote,
    virtualPackage,
    remainingQuantities,
    collapsedDeliveryNotes,
    livraisonParam
  ]);

  // Effet pour nettoyer lors du changement de livraison
  useEffect(() => {
    // Si le paramètre livraison change, nettoyer l'état actuel et réinitialiser
    if (savedState?.livraisonParam && savedState.livraisonParam !== livraisonParam) {
      // Nettoyer l'état actuel
      setVirtualPackage([]);
      setSelectedDeliveryNote(null);
      setRemainingQuantities({});
      setCollapsedDeliveryNotes(new Set());
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [livraisonParam]);

  // Récupérer les bons de livraison non emballés
  const { data: unpackedNotes, mutate: refreshNotes } = useFrappeGetCall<{
    success: boolean;
    unpacked_delivery_notes: UnpackedDeliveryNote[];
  }>('log.log.doctype.colis.colis.get_unpacked_delivery_notes', {
    date_from: null,
    date_to: null,
    customer: null
  });

  // Si une livraison spécifique est demandée, récupérer tous ses bons de livraison
  const { data: livraisonData } = useFrappeGetCall<{
    message: {
      success: boolean;
      livraison_id: string;
      livraison_name: string;
      delivery_notes: Array<{
        bon_de_livraison: string;
        customer: string;
        custom_date_de_livraison: string;
        custom_commune: string;
        custom_wilaya: string;
        total_qty: number;
        grand_total: number;
        status: string;
        type: string;
        items: DeliveryNoteItem[];
      }>;
      total_delivery_notes: number;
    };
  }>('log.log.doctype.colis.colis.get_delivery_notes_for_livraison', {
    livraison_id: livraisonParam
  }, livraisonParam ? undefined : null);

  // Récupérer les articles d'un bon de livraison (seulement si pas de bon spécifique)
  const { data: deliveryNoteItems, mutate: refreshItems } = useFrappeGetCall<{
    success: boolean;
    delivery_note: DeliveryNoteInfo;
    items: DeliveryNoteItem[];
  }>('log.log.doctype.colis.colis.get_delivery_note_items_for_colis', {
    delivery_note_name: selectedDeliveryNote
  }, (selectedDeliveryNote && !livraisonParam) ? undefined : null);

  // Créer un colis
  const { call: createColis } = useFrappePostCall('log.log.doctype.colis.colis.create_colis_from_delivery_note');

  // Déterminer les données à utiliser
  const singleDeliveryNoteData = !livraisonParam ? deliveryNoteItems : null;
  const actualLivraisonData = livraisonData?.message;

  // Effet pour initialiser les quantités restantes
  useEffect(() => {
    const initRemainingQuantities = () => {
      const newRemainingQuantities: RemainingQuantities = {};
      
      if (livraisonParam && actualLivraisonData?.delivery_notes) {
        actualLivraisonData.delivery_notes.forEach((dn: any) => {
          dn.items?.forEach((item: any) => {
            const key = `${dn.bon_de_livraison}-${item.item_code}`;
            newRemainingQuantities[key] = {
              available: item.available_quantity,
              total: item.total_quantity
            };
          });
        });
      } else if (singleDeliveryNoteData?.items && selectedDeliveryNote) {
        singleDeliveryNoteData.items.forEach((item: any) => {
          const key = `${selectedDeliveryNote}-${item.item_code}`;
          newRemainingQuantities[key] = {
            available: item.available_quantity,
            total: item.total_quantity
          };
        });
      }
      
      setRemainingQuantities(newRemainingQuantities);
    };
    
    initRemainingQuantities();
  }, [actualLivraisonData, singleDeliveryNoteData, selectedDeliveryNote, livraisonParam]);

  // Effet pour pré-sélectionner le bon de livraison si le paramètre livraison est fourni
  useEffect(() => {
    if (livraisonParam && !selectedDeliveryNote) {
      setSelectedDeliveryNote(livraisonParam);
    }
  }, [livraisonParam, selectedDeliveryNote]);
  
  // Filtrer les bons de livraison (seulement si pas de bon spécifique)
  const filteredNotes = livraisonParam ? [] : (unpackedNotes?.unpacked_delivery_notes?.filter(note =>
    note.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    note.customer.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []);

  // Gérer la sélection d'un bon de livraison
  const handleSelectDeliveryNote = (noteName: string) => {
    setSelectedDeliveryNote(noteName);
    setVirtualPackage([]);
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  // Gérer l'état des sections collapsibles
  const toggleDeliveryNoteCollapse = (deliveryNoteName: string) => {
    setCollapsedDeliveryNotes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(deliveryNoteName)) {
        newSet.delete(deliveryNoteName);
      } else {
        newSet.add(deliveryNoteName);
      }
      return newSet;
    });
  };

  // Ouvrir/fermer toutes les sections
  const toggleAllDeliveryNotes = () => {
    if (!actualLivraisonData?.delivery_notes) return;
    
    const allDeliveryNoteNames = actualLivraisonData.delivery_notes.map(
      (dn: any) => dn.bon_de_livraison
    );
    
    // Si toutes sont fermées, les ouvrir. Sinon, les fermer toutes
    const allClosed = allDeliveryNoteNames.every((name: string) => 
      collapsedDeliveryNotes.has(name)
    );
    
    if (allClosed) {
      setCollapsedDeliveryNotes(new Set());
    } else {
      setCollapsedDeliveryNotes(new Set(allDeliveryNoteNames));
    }
  };

  // Ajouter un article au colis virtuel
  const addToVirtualPackage = (itemCode: string, itemName: string, quantity: number, uom: string, bonDeLivraison: string) => {
    if (quantity <= 0) return;
    
    const key = `${bonDeLivraison}-${itemCode}`;
    const remaining = remainingQuantities[key];
    
    if (!remaining || quantity > remaining.available) {
      setErrorMessage(`Quantité non disponible pour l'article ${itemCode}`);
      return;
    }
    
    // Validation : vérifier que tous les articles du colis appartiennent au même bon de livraison
    if (virtualPackage.length > 0) {
      const firstBonDeLivraison = virtualPackage[0].bon_de_livraison;
      if (firstBonDeLivraison !== bonDeLivraison) {
        setErrorMessage(`Impossible d'ajouter cet article. Tous les articles du colis doivent appartenir au même bon de livraison (${firstBonDeLivraison}).`);
        return;
      }
    }
    
    // Mettre à jour les quantités restantes
    setRemainingQuantities(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        available: prev[key].available - quantity
      }
    }));
    
    // Ajouter au colis virtuel
    setVirtualPackage(prev => {
      const existing = prev.find(item => 
        item.item_code === itemCode && item.bon_de_livraison === bonDeLivraison
      );
      
      if (existing) {
        return prev.map(item => 
          item.item_code === itemCode && item.bon_de_livraison === bonDeLivraison
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      } else {
        return [...prev, {
          item_code: itemCode,
          item_name: itemName,
          quantity,
          uom,
          bon_de_livraison: bonDeLivraison
        }];
      }
    });
    
    setErrorMessage(null);
  };

  // Vider complètement le colis virtuel
  const clearVirtualPackage = () => {
    setVirtualPackage([]);
    // Restaurer toutes les quantités restantes
    const restoredQuantities: RemainingQuantities = {};
    Object.keys(remainingQuantities).forEach(key => {
      restoredQuantities[key] = {
        available: remainingQuantities[key].total,
        total: remainingQuantities[key].total
      };
    });
    setRemainingQuantities(restoredQuantities);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // Supprimer un article du colis virtuel
  const removeFromVirtualPackage = (itemCode: string, bonDeLivraison: string, quantityToRemove?: number) => {
    const key = `${bonDeLivraison}-${itemCode}`;
    
    setVirtualPackage(prev => {
      const existing = prev.find(item => 
        item.item_code === itemCode && item.bon_de_livraison === bonDeLivraison
      );
      
      if (!existing) return prev;
      
      const removeQty = quantityToRemove || existing.quantity;
      
      // Remettre les quantités disponibles
      setRemainingQuantities(prevRem => ({
        ...prevRem,
        [key]: {
          ...prevRem[key],
          available: prevRem[key].available + removeQty
        }
      }));
      
      if (removeQty >= existing.quantity) {
        return prev.filter(item => 
          !(item.item_code === itemCode && item.bon_de_livraison === bonDeLivraison)
        );
      } else {
        return prev.map(item => 
          item.item_code === itemCode && item.bon_de_livraison === bonDeLivraison
            ? { ...item, quantity: item.quantity - removeQty }
            : item
        );
      }
    });
  };

  // Créer le(s) colis
  const handleCreateColis = async () => {
    if (virtualPackage.length === 0) return;
    setIsCreating(true);
    setErrorMessage(null);

    try {
      if (livraisonParam) {
        // Mode livraison : créer un colis par bon de livraison
        const articlesByDeliveryNote = virtualPackage.reduce((acc, item) => {
          if (!acc[item.bon_de_livraison]) {
            acc[item.bon_de_livraison] = [];
          }
          acc[item.bon_de_livraison].push({
            item_code: item.item_code,
            quantity: item.quantity
          });
          return acc;
        }, {} as Record<string, Array<{item_code: string, quantity: number}>>);

        const results = [];
        for (const [deliveryNoteName, articlesData] of Object.entries(articlesByDeliveryNote)) {
          const result = await createColis({
            delivery_note_name: deliveryNoteName,
            articles_data: articlesData
          });
          results.push({ deliveryNote: deliveryNoteName, result });
        }

        const successfulResults = results.filter(r => r.result.success);
        const failedResults = results.filter(r => !r.result.success);
        
        if (successfulResults.length > 0) {
          const colisNames = successfulResults.map(r => r.result.colis_name).join(', ');
          setSuccessMessage(`${successfulResults.length} colis créé(s) avec succès : ${colisNames}`);
          setVirtualPackage([]);
          refreshNotes();
          refreshItems();
          // Clear localStorage since colis are now created
          clearSavedState();
        }
        
        if (failedResults.length > 0) {
          const errorMessages = failedResults.map(r => `${r.deliveryNote}: ${r.result.message}`).join('; ');
          setErrorMessage(`Erreurs lors de la création : ${errorMessages}`);
        }
      } else {
        // Mode bon de livraison unique
        const articlesData = virtualPackage.map(item => ({
          item_code: item.item_code,
          quantity: item.quantity
        }));

        const result = await createColis({
          delivery_note_name: selectedDeliveryNote,
          articles_data: articlesData
        });

        if (result.success) {
          setSuccessMessage(`Colis créé avec succès : ${result.colis_name}`);
          setVirtualPackage([]);
          refreshNotes();
          refreshItems();
          // Clear localStorage since colis is now created
          clearSavedState();
        } else {
          setErrorMessage(result.message || 'Erreur lors de la création du colis');
        }
      }
    } catch (error) {
      setErrorMessage('Erreur lors de la création du colis');
      console.error('Erreur création colis:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="bg-background min-h-screen flex flex-col">
      {/* Header */}
      <div className="border-b border-border flex-shrink-0">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap justify-between">
            <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
              {livraisonParam && (
                <>
                  <button
                    onClick={() => window.history.back()}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/30"
                    title="Retour aux détails de la livraison"
                  >
                    <FileText className="w-3 h-3" />
                    <span className="text-xs font-medium hidden sm:inline">Livraison {livraisonParam}</span>
                    <span className="text-xs font-medium sm:hidden">{livraisonParam}</span>
                  </button>
                  <Circle className="w-1 h-1 fill-current hidden sm:block" />
                </>
              )}

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
      <div className="max-w-7xl mx-auto px-3 sm:px-4 pt-4 sm:pt-6 pb-8 flex-1 flex flex-col min-h-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 gap-2 sm:gap-3">
          <h1 className="text-lg sm:text-2xl font-bold text-foreground leading-tight">
            {livraisonParam ? 'Création de Colis' : 'Préparation de Colis'}
          </h1>
        </div>

        {livraisonParam && (
          <Card className="p-3 sm:p-4 mb-5">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
              <MetaChip
                icon={<Clipboard className="w-4 h-4" />}
                label="Livraison"
                value={actualLivraisonData?.livraison_name || livraisonParam}
              />
              <MetaChip
                icon={<Calendar className="w-4 h-4" />}
                label="Date"
                value={(() => {
                  // Récupérer la date de livraison du premier bon de livraison
                  const firstDeliveryNote = actualLivraisonData?.delivery_notes?.[0];
                  return firstDeliveryNote?.custom_date_de_livraison 
                    ? formatDate(firstDeliveryNote.custom_date_de_livraison)
                    : "—";
                })()}
              />
              <MetaChip
                icon={<FileText className="w-4 h-4" />}
                label="Bons"
                value={`${actualLivraisonData?.total_delivery_notes || 0} BL`}
              />
              <MetaChip
                icon={<Package className="w-4 h-4" />}
                label="Articles"
                value={actualLivraisonData?.delivery_notes?.reduce((total: number, dn: any) => total + (dn.items?.length || 0), 0) || 0}
              />
              <MetaChip
                icon={<Clock className="w-4 h-4" />}
                label="Statut"
                value="En préparation"
              />
            </div>
          </Card>
        )}

        {/* Messages de succès/erreur */}
        {successMessage && (
          <Alert className="border-green-200 bg-green-50 mb-4 dark:border-green-800 dark:bg-green-900/20">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-green-800 dark:text-green-300">
              {successMessage}
            </AlertDescription>
          </Alert>
        )}

        {errorMessage && (
          <Alert className="border-red-200 bg-red-50 mb-4 dark:border-red-800 dark:bg-red-900/20">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <AlertDescription className="text-red-800 dark:text-red-300">
              {errorMessage}
            </AlertDescription>
          </Alert>
        )}

        <div className={`grid gap-6 ${livraisonParam ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1 xl:grid-cols-5'}`}>
          {/* Liste des bons de livraison - cachée si bon spécifique */}
          {!livraisonParam && (
            <Card className="overflow-hidden flex flex-col min-h-0 xl:col-span-3">
              <CardHeader className="px-4 py-3 border-b border-border flex-shrink-0">
                <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Bons de Livraison Non Emballés
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-50 text-gray-700 border border-gray-200 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-800 text-xs font-medium">
                    {filteredNotes.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 flex-1 flex flex-col min-h-0">
                <div className="relative mb-4 flex-shrink-0">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Rechercher par numéro ou client..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="space-y-2 flex-1 overflow-y-auto">
                  {filteredNotes.map((note) => (
                    <div
                      key={note.name}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedDeliveryNote === note.name
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800'
                          : 'border-border hover:border-blue-400 hover:bg-accent/30'
                      }`}
                      onClick={() => handleSelectDeliveryNote(note.name)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-foreground">{note.name}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-4 mt-1">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {note.customer}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(note.posting_date)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{formatAmount(note.grand_total)}</div>
                          <div className="text-xs text-muted-foreground">
                            {note.unpacked_items_count} articles non emballés
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredNotes.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Aucun bon de livraison trouvé</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Articles à emballer */}
          <Card className={`overflow-hidden flex flex-col ${livraisonParam ? 'lg:col-span-2' : 'xl:col-span-3'}`}>
            <CardHeader className="px-4 py-3 border-b border-border flex-shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  <span className="hidden sm:inline">Articles à Emballer</span>
                  <span className="sm:hidden">Articles</span>
                  {virtualPackage.length > 0 && (
                    <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 text-xs font-medium">
                      {virtualPackage.length} en attente
                    </span>
                  )}
                </CardTitle>
                {livraisonParam && actualLivraisonData?.delivery_notes && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={toggleAllDeliveryNotes}
                    className="text-xs w-full sm:w-auto"
                  >
                    <span className="hidden sm:inline">
                      {collapsedDeliveryNotes.size === actualLivraisonData.delivery_notes.length 
                        ? 'Tout ouvrir' 
                        : 'Tout fermer'}
                    </span>
                    <span className="sm:hidden">
                      {collapsedDeliveryNotes.size === actualLivraisonData.delivery_notes.length 
                        ? 'Ouvrir' 
                        : 'Fermer'}
                    </span>
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 flex-1 flex flex-col min-h-0">
              {!selectedDeliveryNote && !livraisonParam ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Sélectionnez un bon de livraison pour voir les articles</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col">
                  {/* Informations du bon de livraison */}
                  {singleDeliveryNoteData?.delivery_note && (
                    <Card className="mb-4 p-3 bg-blue-50 border border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 flex-shrink-0">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <MetaChip
                          icon={<FileText className="w-4 h-4" />}
                          label="Bon"
                          value={singleDeliveryNoteData.delivery_note.name}
                        />
                        <MetaChip
                          icon={<User className="w-4 h-4" />}
                          label="Client"
                          value={singleDeliveryNoteData.delivery_note.customer}
                        />
                      </div>
                    </Card>
                  )}

                  {/* Liste des articles */}
                  <div className="space-y-6">
                    {livraisonParam && actualLivraisonData?.delivery_notes ? (
                      // Affichage pour une livraison avec plusieurs bons de livraison
                      actualLivraisonData.delivery_notes.map((deliveryNote: any) => {
                        const isCollapsed = collapsedDeliveryNotes.has(deliveryNote.bon_de_livraison);
                        const deliveryNoteArticlesCount = deliveryNote.items?.length || 0;
                        const deliveryNoteItemsInPackage = virtualPackage.filter(
                          item => item.bon_de_livraison === deliveryNote.bon_de_livraison
                        ).length;
                        
                        return (
                          <Collapsible
                            key={deliveryNote.bon_de_livraison}
                            open={!isCollapsed}
                            onOpenChange={() => toggleDeliveryNoteCollapse(deliveryNote.bon_de_livraison)}
                          >
                            <Card className="overflow-hidden">
                              <CollapsibleTrigger asChild>
                                <div className="w-full px-4 py-4 border-b border-border cursor-pointer hover:bg-accent/30 transition-colors">
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    {/* Section principale avec icône et informations */}
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      {isCollapsed ? (
                                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                      ) : (
                                        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                      )}
                                      <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex-shrink-0">
                                        <Clipboard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-sm sm:text-base text-blue-700 dark:text-blue-400 truncate">
                                          {deliveryNote.bon_de_livraison}
                                        </div>
                                        <div className="text-xs sm:text-sm text-muted-foreground mt-1">
                                          <div className="flex items-center gap-2">
                                            <span className="truncate">{deliveryNote.customer}</span>
                                            {deliveryNote.custom_date_de_livraison && (
                                              <>
                                                <span className="text-muted-foreground/60 hidden sm:inline">•</span>
                                                <span className="hidden sm:flex items-center gap-1">
                                                  <Calendar className="w-3 h-3" />
                                                  {formatDate(deliveryNote.custom_date_de_livraison)}
                                                </span>
                                              </>
                                            )}
                                          </div>
                                          {deliveryNote.custom_date_de_livraison && (
                                            <div className="sm:hidden flex items-center gap-1 mt-1">
                                              <Calendar className="w-3 h-3" />
                                              {formatDate(deliveryNote.custom_date_de_livraison)}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Section des badges et statistiques */}
                                    <div className="flex items-center gap-2">
                                      {deliveryNoteItemsInPackage > 0 && (
                                        <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 text-xs font-medium px-2 py-1">
                                          {deliveryNoteItemsInPackage} ajouté(s)
                                        </Badge>
                                      )}
                                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 text-xs font-medium px-2 py-1">
                                        {deliveryNoteArticlesCount} article(s)
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              </CollapsibleTrigger>
                              
                              <CollapsibleContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-up-2 data-[state=open]:slide-down-2">
                                <div className="p-4">
                                  {/* Version tableau pour desktop */}
                                  <div className="hidden sm:block">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Code Article</TableHead>
                                          <TableHead>Nom</TableHead>
                                          <TableHead className="text-center">Qté Total</TableHead>
                                          <TableHead className="text-center">Qté Restante</TableHead>
                                          <TableHead className="text-center">Action</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {deliveryNote.items?.map((item: any) => {
                                          const key = `${deliveryNote.bon_de_livraison}-${item.item_code}`;
                                          const remaining = remainingQuantities[key]?.available || 0;
                                          
                                          const canAddToPackage = virtualPackage.length === 0 || virtualPackage[0].bon_de_livraison === deliveryNote.bon_de_livraison;
                                          
                                          return (
                                            <ArticleRow
                                              key={key}
                                              item={item}
                                              bonDeLivraison={deliveryNote.bon_de_livraison}
                                              remainingQuantity={remaining}
                                              onAddToPackage={addToVirtualPackage}
                                              virtualPackage={virtualPackage}
                                              canAddToPackage={canAddToPackage}
                                            />
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                  
                                  {/* Version cartes pour mobile */}
                                  <div className="sm:hidden space-y-3">
                                    {deliveryNote.items?.map((item: any) => {
                                      const key = `${deliveryNote.bon_de_livraison}-${item.item_code}`;
                                      const remaining = remainingQuantities[key]?.available || 0;
                                      
                                      const canAddToPackage = virtualPackage.length === 0 || virtualPackage[0].bon_de_livraison === deliveryNote.bon_de_livraison;
                                      
                                      return (
                                        <ArticleRow
                                          key={key}
                                          item={item}
                                          bonDeLivraison={deliveryNote.bon_de_livraison}
                                          remainingQuantity={remaining}
                                          onAddToPackage={addToVirtualPackage}
                                          virtualPackage={virtualPackage}
                                          canAddToPackage={canAddToPackage}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                              </CollapsibleContent>
                            </Card>
                          </Collapsible>
                        );
                      })
                    ) : (
                      // Affichage pour un seul bon de livraison
                      singleDeliveryNoteData?.items && (
                        <>
                          {/* Version tableau pour desktop */}
                          <div className="hidden sm:block">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Code Article</TableHead>
                                  <TableHead>Nom</TableHead>
                                  <TableHead className="text-center">Qté Total</TableHead>
                                  <TableHead className="text-center">Qté Restante</TableHead>
                                  <TableHead className="text-center">Action</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {singleDeliveryNoteData.items.map((item: any) => {
                                  const key = `${selectedDeliveryNote}-${item.item_code}`;
                                  const remaining = remainingQuantities[key]?.available || 0;
                                  const canAddToPackage = virtualPackage.length === 0 || virtualPackage[0].bon_de_livraison === selectedDeliveryNote;
                                  
                                  return (
                                    <ArticleRow
                                      key={key}
                                      item={item}
                                      bonDeLivraison={selectedDeliveryNote || ''}
                                      remainingQuantity={remaining}
                                      onAddToPackage={addToVirtualPackage}
                                      virtualPackage={virtualPackage}
                                      canAddToPackage={canAddToPackage}
                                    />
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                          
                          {/* Version cartes pour mobile */}
                          <div className="sm:hidden space-y-3">
                            {singleDeliveryNoteData.items.map((item: any) => {
                              const key = `${selectedDeliveryNote}-${item.item_code}`;
                              const remaining = remainingQuantities[key]?.available || 0;
                              const canAddToPackage = virtualPackage.length === 0 || virtualPackage[0].bon_de_livraison === selectedDeliveryNote;
                              
                              return (
                                <ArticleRow
                                  key={key}
                                  item={item}
                                  bonDeLivraison={selectedDeliveryNote || ''}
                                  remainingQuantity={remaining}
                                  onAddToPackage={addToVirtualPackage}
                                  virtualPackage={virtualPackage}
                                  canAddToPackage={canAddToPackage}
                                />
                              );
                            })}
                          </div>
                        </>
                      )
                    )}
                  </div>


                </div>
              )}
            </CardContent>
          </Card>

          {/* Aperçu du Colis Virtuel - Colonne de droite */}
          <Card className={`flex flex-col ${livraisonParam ? 'lg:col-span-1' : 'xl:col-span-2'}`}>
            <CardHeader className="px-4 py-3 border-b border-border flex-shrink-0">
              <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Package className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="hidden sm:inline">Aperçu du Colis</span>
                <span className="sm:hidden">Aperçu</span>
                {virtualPackage.length > 0 && (
                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 text-xs font-medium">
                    {virtualPackage.length} article(s)
                  </span>
                )}
              </CardTitle>
              {virtualPackage.length > 0 && (
                <div className="mt-2">
                  <div className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 text-xs font-medium">
                    <Clipboard className="w-3 h-3 mr-1" />
                    <span className="hidden sm:inline">Bon de livraison: {virtualPackage[0].bon_de_livraison}</span>
                    <span className="sm:hidden">BL: {virtualPackage[0].bon_de_livraison}</span>
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-4 flex-1 flex flex-col min-h-0">
              {virtualPackage.length === 0 ? (
                <div className="flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Package className="h-16 w-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg font-medium mb-2">Colis Vide</p>
                    <p className="text-sm">Ajoutez des articles depuis le tableau de gauche</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col">
                  {/* Liste des articles dans le colis virtuel */}
                  <div className="space-y-3 mb-4">
                    {virtualPackage.map((item, index) => (
                      <Card key={`${item.bon_de_livraison}-${item.item_code}-${index}`} 
                            className="p-3 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-green-800 dark:text-green-300 truncate">
                              {item.item_code}
                            </div>
                            <div className="text-xs text-green-700 dark:text-green-400 mt-1 break-words">
                              {item.item_name}
                            </div>
                            {livraisonParam && (
                              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                                <span className="hidden sm:inline">BL: {item.bon_de_livraison}</span>
                                <span className="sm:hidden">{item.bon_de_livraison}</span>
                              </div>
                            )}
                            <div className="text-sm font-semibold text-green-800 dark:text-green-300 mt-2">
                              <span className="hidden sm:inline">Qté: {item.quantity} {item.uom}</span>
                              <span className="sm:hidden">{item.quantity} {item.uom}</span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeFromVirtualPackage(item.item_code, item.bon_de_livraison)}
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 self-end sm:self-start flex-shrink-0"
                            title="Retirer du colis"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>

                  {/* Résumé et bouton de création */}
                  <div className="border-t border-border pt-4 flex-shrink-0">
                    <div className="bg-gray-50 dark:bg-gray-900/20 rounded-lg p-3 mb-4">
                      <div className="text-sm text-muted-foreground mb-2">
                        <span className="hidden sm:inline">Résumé du colis</span>
                        <span className="sm:hidden">Résumé</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex flex-col">
                          <span className="text-muted-foreground">
                            <span className="hidden sm:inline">Total articles:</span>
                            <span className="sm:hidden">Articles:</span>
                          </span>
                          <span className="font-medium">{virtualPackage.length}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-muted-foreground">
                            <span className="hidden sm:inline">Total quantité:</span>
                            <span className="sm:hidden">Quantité:</span>
                          </span>
                          <span className="font-medium">
                            {virtualPackage.reduce((total, item) => total + item.quantity, 0)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Button
                        onClick={handleCreateColis}
                        disabled={isCreating}
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                        size="lg"
                      >
                        {isCreating ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                            <span className="hidden sm:inline">Création en cours...</span>
                            <span className="sm:hidden">Création...</span>
                          </>
                        ) : (
                          <>
                            <Package className="h-5 w-5 mr-2" />
                            <span className="hidden sm:inline">{livraisonParam ? 'Créer les Colis' : 'Créer le Colis'}</span>
                            <span className="sm:hidden">Créer</span>
                          </>
                        )}
                      </Button>
                      
                      <Button
                        onClick={clearVirtualPackage}
                        variant="outline"
                        className="w-full"
                        size="sm"
                      >
                        <X className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Vider le colis</span>
                        <span className="sm:hidden">Vider</span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}