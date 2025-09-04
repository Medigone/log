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
  Plus,
  X,
  Trash,
  Minus,
  Dot,
  ChevronDown,
  ChevronRight,
  QrCode,
  Printer,
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
      month: "2-digit",
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

  const handleIncrement = () => {
    if (quantity < remainingQuantity) {
      setQuantity(quantity + 1);
    }
  };

  const handleDecrement = () => {
    if (quantity > 1) {
      setQuantity(quantity - 1);
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
            <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDecrement}
                disabled={quantity <= 1 || remainingQuantity === 0 || !canAddToPackage}
                className="h-8 w-8 p-0 rounded-none border-r border-gray-300 hover:bg-gray-100"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Input
                type="number"
                min="1"
                max={remainingQuantity}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-16 h-8 text-center border-0 rounded-none focus:ring-0"
                disabled={remainingQuantity === 0 || !canAddToPackage}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={handleIncrement}
                disabled={quantity >= remainingQuantity || remainingQuantity === 0 || !canAddToPackage}
                className="h-8 w-8 p-0 rounded-none border-l border-gray-300 hover:bg-gray-100"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
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
              <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDecrement}
                  disabled={quantity <= 1 || remainingQuantity === 0 || !canAddToPackage}
                  className="h-8 w-8 p-0 rounded-none border-r border-gray-300 hover:bg-gray-100"
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <Input
                  type="number"
                  min="1"
                  max={remainingQuantity}
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-16 h-8 text-center border-0 rounded-none focus:ring-0"
                  disabled={remainingQuantity === 0 || !canAddToPackage}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleIncrement}
                  disabled={quantity >= remainingQuantity || remainingQuantity === 0 || !canAddToPackage}
                  className="h-8 w-8 p-0 rounded-none border-l border-gray-300 hover:bg-gray-100"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
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
  const [collapsedColisSections, setCollapsedColisSections] = useState<Set<string>>(new Set());
  const [showQRCode, setShowQRCode] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [colisData, setColisData] = useState<any>(null);

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

  // Déterminer les données à utiliser
  const singleDeliveryNoteData = !livraisonParam ? deliveryNoteItems : null;
  const actualLivraisonData = livraisonData?.message;

  // Fonction pour rafraîchir les colis
  const refreshColis = async () => {
    try {
      const deliveryNotes = livraisonParam && actualLivraisonData?.delivery_notes 
        ? actualLivraisonData.delivery_notes.map((dn: any) => dn.bon_de_livraison)
        : selectedDeliveryNote ? [selectedDeliveryNote] : [];
      
      if (deliveryNotes.length > 0) {
        const response = await fetch('/api/method/log.log.doctype.colis.colis.get_colis_for_delivery_notes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Frappe-CSRF-Token': (window as any).csrf_token
          },
          body: JSON.stringify({
            delivery_notes: deliveryNotes
          })
        });
        const data = await response.json();
        setColisData(data.message);
      }
    } catch (error) {
      console.error('Erreur lors du rafraîchissement des colis:', error);
    }
  };

  // Créer un colis
  const { call: createColis } = useFrappePostCall('log.log.doctype.colis.colis.create_colis_from_delivery_note');

  // Effet pour initialiser les quantités restantes
  useEffect(() => {
    const initRemainingQuantities = () => {
      const newRemainingQuantities: RemainingQuantities = {};
      
      if (livraisonParam && actualLivraisonData?.delivery_notes) {
        actualLivraisonData.delivery_notes.forEach((dn: any) => {
          dn.items?.forEach((item: any) => {
            const key = `${dn.bon_de_livraison}-${item.item_code}`;
            // Calculer la quantité déjà utilisée dans le colis virtuel
            const usedInVirtualPackage = virtualPackage
              .filter(vp => vp.bon_de_livraison === dn.bon_de_livraison && vp.item_code === item.item_code)
              .reduce((total, vp) => total + vp.quantity, 0);
            
            newRemainingQuantities[key] = {
              available: Math.max(0, item.available_quantity - usedInVirtualPackage),
              total: item.total_quantity
            };
          });
        });
      } else if (singleDeliveryNoteData?.items && selectedDeliveryNote) {
        singleDeliveryNoteData.items.forEach((item: any) => {
          const key = `${selectedDeliveryNote}-${item.item_code}`;
          // Calculer la quantité déjà utilisée dans le colis virtuel
          const usedInVirtualPackage = virtualPackage
            .filter(vp => vp.bon_de_livraison === selectedDeliveryNote && vp.item_code === item.item_code)
            .reduce((total, vp) => total + vp.quantity, 0);
          
          newRemainingQuantities[key] = {
            available: Math.max(0, item.available_quantity - usedInVirtualPackage),
            total: item.total_quantity
          };
        });
      }
      
      setRemainingQuantities(newRemainingQuantities);
    };
    
    initRemainingQuantities();
  }, [actualLivraisonData, singleDeliveryNoteData, selectedDeliveryNote, livraisonParam, virtualPackage]);

  // Effet pour pré-sélectionner le bon de livraison si le paramètre livraison est fourni
  useEffect(() => {
    if (livraisonParam && !selectedDeliveryNote) {
      setSelectedDeliveryNote(livraisonParam);
    }
  }, [livraisonParam, selectedDeliveryNote]);

  // Effet pour rafraîchir les colis quand les données de livraison sont chargées
  useEffect(() => {
    if (actualLivraisonData?.delivery_notes || selectedDeliveryNote) {
      refreshColis();
    }
  }, [actualLivraisonData, selectedDeliveryNote]);

  
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

  // Gérer l'état des sections colis
  const toggleColisSection = (deliveryNoteName: string) => {
    setCollapsedColisSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(deliveryNoteName)) {
        newSet.delete(deliveryNoteName);
      } else {
        newSet.add(deliveryNoteName);
      }
      return newSet;
    });
  };

  // Fonction pour afficher le QR code
  const handleShowQRCode = (colisId: string) => {
    setShowQRCode(colisId);
  };

  // Fonction pour imprimer le QR code
  const handlePrintQRCode = (colis: any) => {
    if (!colis.image_url) {
      alert('Aucun QR code disponible pour ce colis');
      return;
    }

    // Créer une fenêtre d'impression optimisée pour imprimante thermique
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Dimensions optimisées pour étiquette thermique carrée (50mm x 50mm)
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Code - ${colis.name}</title>
        <style>
          @page {
            size: 50mm 50mm;
            margin: 2mm;
          }
          body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
            font-size: 8px;
            text-align: center;
          }
          .label {
            width: 46mm;
            height: 46mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            border: 1px solid #000;
            box-sizing: border-box;
          }
          .qr-code {
            width: 30mm;
            height: 30mm;
            margin-bottom: 3mm;
          }
          .colis-id {
            font-weight: bold;
            font-size: 10px;
            margin-bottom: 1mm;
          }
          .sequence {
            font-size: 9px;
            color: #666;
            margin-bottom: 1mm;
          }
          .client {
            font-size: 8px;
            color: #666;
            margin-bottom: 1mm;
          }
          .date {
            font-size: 7px;
            color: #999;
          }
        </style>
      </head>
      <body>
        <div class="label">
          <img src="${colis.image_url}" alt="QR Code" class="qr-code" />
          <div class="colis-id">${colis.name}</div>
          ${colis.custom_numero_sequence ? `<div class="sequence">N° ${colis.custom_numero_sequence}</div>` : ''}
          <div class="client">${colis.client}</div>
          <div class="date">${formatDate(colis.date_creation)}</div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Attendre que l'image soit chargée avant d'imprimer
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    };
  };

  // Fonction pour vérifier si un bon de livraison est complètement préparé
  const isDeliveryNoteFullyPrepared = (deliveryNote: any) => {
    if (!deliveryNote.items) return false;
    
    // Vérifier si tous les articles ont une quantité restante de 0
    return deliveryNote.items.every((item: any) => {
      const key = `${deliveryNote.bon_de_livraison}-${item.item_code}`;
      const remaining = remainingQuantities[key]?.available || 0;
      return remaining === 0;
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
      setCollapsedColisSections(new Set());
    } else {
      setCollapsedDeliveryNotes(new Set(allDeliveryNoteNames));
      setCollapsedColisSections(new Set(allDeliveryNoteNames));
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

        // Vérifier si le résultat contient un colis_name (indicateur de succès)
        const successfulResults = results.filter(r => 
          (r.result.message && r.result.message.colis_name) || 
          (r.result.colis_name) || 
          (r.result.success === true)
        );
        const failedResults = results.filter(r => 
          !(r.result.message && r.result.message.colis_name) && 
          !r.result.colis_name && 
          r.result.success !== true
        );
        
        if (successfulResults.length > 0) {
          const colisNames = successfulResults.map(r => 
            (r.result.message && r.result.message.colis_name) || r.result.colis_name
          ).join(', ');
          // Rafraîchir les données immédiatement
          refreshNotes();
          refreshItems();
          refreshColis();
          // Clear localStorage since colis are now created
          clearSavedState();
          // Vider le colis virtuel et afficher le message de succès
          setVirtualPackage([]);
          setSuccessMessage(`${successfulResults.length} colis créé(s) avec succès : ${colisNames}`);
        }
        
        if (failedResults.length > 0) {
          const errorMessages = failedResults.map(r => {
            const message = typeof r.result.message === 'string' 
              ? r.result.message 
              : r.result.message?.message || r.result.message?.exc || 'Erreur inconnue';
            return `${r.deliveryNote}: ${message}`;
          }).join('; ');
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

        
        if ((result.message && result.message.colis_name) || result.colis_name || result.success === true) {
          const colisName = (result.message && result.message.colis_name) || result.colis_name;
          // Rafraîchir les données immédiatement
          refreshNotes();
          refreshItems();
          refreshColis();
          // Clear localStorage since colis is now created
          clearSavedState();
          // Vider le colis virtuel et afficher le message de succès
          setVirtualPackage([]);
          setSuccessMessage(`Colis créé avec succès : ${colisName}`);
        } else {
          const message = typeof result.message === 'string' 
            ? result.message 
            : result.message?.message || result.message?.exc || 'Erreur lors de la création du colis';
          setErrorMessage(message);
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
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap justify-between">
            <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
              <span>Livraison</span>
              <Dot className="w-4 h-4" />
              <span>Création de Colis</span>
            </div>
            <div className="flex items-center gap-3">
              {livraisonParam && (
                <button 
                  onClick={() => window.location.href = `#/livraison/${livraisonParam}`}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/30"
                >
                  <Clipboard className="w-3 h-3" />
                  <span className="text-xs font-medium">Livraison {livraisonParam}</span>
                </button>
              )}
              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                <Package className="w-3 h-3" />
                <span className="text-xs font-medium">Mode Préparateur</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 pt-4 sm:pt-6 pb-8 flex-1 flex flex-col min-h-0">

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
                        const deliveryNoteItemsInPackage = virtualPackage
                          .filter((item: any) => item.bon_de_livraison === deliveryNote.bon_de_livraison)
                          .reduce((total: number, item: any) => total + item.quantity, 0);
                        const deliveryNoteRemainingTotal = deliveryNote.items?.reduce((total: number, item: any) => {
                          const key = `${deliveryNote.bon_de_livraison}-${item.item_code}`;
                          return total + (remainingQuantities[key]?.available || 0);
                        }, 0) || 0;
                        const isFullyPrepared = isDeliveryNoteFullyPrepared(deliveryNote);
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
                                      <div className={`p-2 rounded-lg flex-shrink-0 ${
                                        isFullyPrepared 
                                          ? 'bg-green-100 dark:bg-green-900/20' 
                                          : 'bg-blue-100 dark:bg-blue-900/20'
                                      }`}>
                                        {isFullyPrepared ? (
                                          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                                        ) : (
                                          <Clipboard className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className={`font-semibold text-sm sm:text-base truncate ${
                                          isFullyPrepared 
                                            ? 'text-green-700 dark:text-green-400' 
                                            : 'text-blue-700 dark:text-blue-400'
                                        }`}>
                                          {deliveryNote.bon_de_livraison}
                                        </div>
                                        <div className="text-xs sm:text-sm text-muted-foreground mt-1">
                                          <div className="flex items-center gap-2">
                                            <span className="hidden sm:flex items-center gap-1">
                                              <User className="w-3 h-3" />
                                              <span className="truncate">{deliveryNote.customer}</span>
                                            </span>
                                            <span className="sm:hidden flex items-center gap-1">
                                              <User className="w-3 h-3" />
                                              <span className="truncate">{deliveryNote.customer}</span>
                                            </span>
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
                                      {isFullyPrepared ? (
                                        <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 text-xs font-medium px-2 py-1">
                                          <CheckCircle className="w-3 h-3 mr-1" />
                                          Finalisé
                                        </Badge>
                                      ) : (
                                        <>
                                          <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 text-xs font-medium px-2 py-1">
                                            {deliveryNoteItemsInPackage} ajouté(s)
                                          </Badge>
                                          {deliveryNoteRemainingTotal > 0 && (
                                            <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800 text-xs font-medium px-2 py-1">
                                              {deliveryNoteRemainingTotal} restant(s)
                                            </Badge>
                                          )}
                                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 text-xs font-medium px-2 py-1">
                                            {virtualPackage.filter(item => item.bon_de_livraison === deliveryNote.bon_de_livraison).length} article(s)
                                          </Badge>
                                        </>
                                      )}
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
                              
                              {/* Section des colis créés - intégrée dans la même carte */}
                              {(() => {
                                const colisForThisDeliveryNote = colisData?.colis?.filter(
                                  (colis: any) => colis.bl === deliveryNote.bon_de_livraison
                                ) || [];
                                
                                if (colisForThisDeliveryNote.length === 0) return null;
                                
                                const isColisSectionCollapsed = collapsedColisSections.has(deliveryNote.bon_de_livraison);
                                
                                return (
                                  <div className="border-t border-border">
                                    <Collapsible
                                      open={!isColisSectionCollapsed}
                                      onOpenChange={() => toggleColisSection(deliveryNote.bon_de_livraison)}
                                    >
                                      <CollapsibleTrigger asChild>
                                        <div className="w-full px-4 py-3 cursor-pointer hover:bg-accent/30 transition-colors">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              {isColisSectionCollapsed ? (
                                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                              ) : (
                                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                              )}
                                              <Package className="w-4 h-4 text-green-600 dark:text-green-400" />
                                              <span className="font-medium text-green-700 dark:text-green-400">
                                                Colis créés ({colisForThisDeliveryNote.length})
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 text-xs">
                                                {colisForThisDeliveryNote.reduce((total: number, colis: any) => total + (colis.articles?.reduce((artTotal: number, article: any) => artTotal + (article.quantite_totale || 0), 0) || 0), 0)} articles
                                              </Badge>
                                            </div>
                                          </div>
                                        </div>
                                      </CollapsibleTrigger>
                                      
                                      <CollapsibleContent className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-up-2 data-[state=open]:slide-down-2">
                                        <div className="px-4 pb-4">
                                          <div className="space-y-3">
                                            {colisForThisDeliveryNote.map((colis: any) => (
                                              <Card key={colis.name} className="p-3 bg-background border-gray-200 dark:border-gray-700">
                                                <div className="space-y-3">
                                                  {/* Top Section */}
                                                  <div className="flex items-center gap-2">
                                                    <Package className="w-4 h-4 text-green-600 dark:text-green-400" />
                                                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                                                      {colis.name}
                                                    </Badge>
                                                    {colis.custom_numero_sequence && (
                                                      <Badge variant="outline" className="text-xs">
                                                        N° {colis.custom_numero_sequence}
                                                      </Badge>
                                                    )}
                                                  </div>

                                                  {/* Date Section */}
                                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <Calendar className="w-3 h-3" />
                                                    <span>{formatDate(colis.date_creation)}</span>
                                                  </div>

                                                  {/* Actions Section */}
                                                  <div className="flex items-center justify-center gap-2">
                                                    <Button
                                                      size="sm"
                                                      variant="outline"
                                                      onClick={() => handleShowQRCode(colis.name)}
                                                      className="h-8 px-3 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                                                      title="Afficher QR Code"
                                                    >
                                                      <QrCode className="w-3 h-3 mr-1" />
                                                      QR Code
                                                    </Button>
                                                    <Button
                                                      size="sm"
                                                      variant="outline"
                                                      onClick={() => handlePrintQRCode(colis)}
                                                      className="h-8 px-3 text-xs hover:bg-green-50 dark:hover:bg-green-900/20 border-green-200 dark:border-green-800"
                                                      title="Imprimer QR Code"
                                                    >
                                                      <Printer className="w-3 h-3 mr-1" />
                                                      Imprimer
                                                    </Button>
                                                  </div>

                                                  {/* Bottom Section - Status and Totals */}
                                                  <div className="flex items-center justify-between">
                                                    <Badge className={`text-xs ${
                                                      colis.status === 'Livré' 
                                                        ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                                                        : colis.status === 'En attente'
                                                        ? 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800'
                                                        : 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
                                                    }`}>
                                                      {colis.status}
                                                    </Badge>
                                                    <div className="flex items-center gap-2">
                                                      <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 text-xs">
                                                        {colis.articles.reduce((total: number, article: any) => total + (article.quantite_totale || 0), 0)} total
                                                      </Badge>
                                                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 text-xs">
                                                        {colis.articles.length} unique(s)
                                                      </Badge>
                                                    </div>
                                                  </div>

                                                  {/* Articles du colis */}
                                                  {colis.articles && colis.articles.length > 0 && (
                                                    <div className="space-y-2 mt-4">
                                                      {/* Version desktop - tableau */}
                                                      <div className="hidden sm:block space-y-1">
                                                        {colis.articles.map((article: any, index: number) => (
                                                          <div key={index} className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-900/50 rounded p-2">
                                                            <div className="flex-1 min-w-0">
                                                              <div className="font-medium truncate">{article.article}</div>
                                                            </div>
                                                            <div className="flex items-center gap-2 ml-2">
                                                              <span className="text-muted-foreground">
                                                                Qté: {article.quantite_totale}
                                                              </span>
                                                              <Badge 
                                                                variant="outline" 
                                                                className={`text-xs ${
                                                                  article.statut_article === 'Livré'
                                                                    ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                                                                    : article.statut_article === 'En attente'
                                                                    ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800'
                                                                    : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
                                                                }`}
                                                              >
                                                                {article.statut_article}
                                                              </Badge>
                                                            </div>
                                                          </div>
                                                        ))}
                                                      </div>

                                                      {/* Version mobile - cartes */}
                                                      <div className="sm:hidden space-y-2">
                                                        {colis.articles.map((article: any, index: number) => (
                                                          <Card key={index} className="p-3 border border-border/50 bg-card/30 hover:shadow-md transition-all duration-200">
                                                            <div className="space-y-3">
                                                              {/* En-tête de l'article */}
                                                              <div className="flex flex-col gap-2">
                                                                <div className="flex-1 min-w-0">
                                                                  <div className="font-medium text-sm text-foreground truncate">
                                                                    {article.article}
                                                                  </div>
                                                                </div>
                                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 text-xs">
                                                                    Qté: {article.quantite_totale}
                                                                  </Badge>
                                                                  <Badge 
                                                                    variant="outline" 
                                                                    className={`text-xs ${
                                                                      article.statut_article === 'Livré'
                                                                        ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                                                                        : article.statut_article === 'En attente'
                                                                        ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800'
                                                                        : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
                                                                    }`}
                                                                  >
                                                                    {article.statut_article}
                                                                  </Badge>
                                                                </div>
                                                              </div>
                                                            </div>
                                                          </Card>
                                                        ))}
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              </Card>
                                            ))}
                                          </div>
                                        </div>
                                      </CollapsibleContent>
                                    </Collapsible>
                                  </div>
                                );
                              })()}
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
                            className="p-3 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Package className="w-4 h-4 text-white flex-shrink-0" />
                              <div className="font-medium text-sm text-white truncate">
                                {item.item_code}
                              </div>
                            </div>
                            <div className="text-sm font-semibold text-white ml-2">
                              <span className="hidden sm:inline">Qté: {item.quantity}</span>
                              <span className="sm:hidden">Qté: {item.quantity}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-white break-words flex-1">
                              {item.item_name}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeFromVirtualPackage(item.item_code, item.bon_de_livraison)}
                              className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
                              title="Retirer du colis"
                            >
                              <Trash className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>

                  {/* Résumé et bouton de création */}
                  <div className="border-t border-border pt-4 flex-shrink-0">
                    <div className="bg-gray-50 dark:bg-gray-900/20 rounded-lg p-3 mb-4">
                      <div className="text-sm text-muted-foreground mb-3">
                        <span className="hidden sm:inline">Résumé du colis</span>
                        <span className="sm:hidden">Résumé</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 text-xs font-medium px-2 py-1">
                          {virtualPackage.reduce((total, item) => total + item.quantity, 0)} ajouté(s)
                        </Badge>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 text-xs font-medium px-2 py-1">
                          {virtualPackage.length} article(s)
                        </Badge>
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

      {/* Modal pour afficher le QR Code */}
      {showQRCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">QR Code du Colis</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowQRCode(null)}
                className="h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="text-center">
              {colisData?.colis?.find((c: any) => c.name === showQRCode)?.image_url ? (
                <div className="space-y-4">
                  <img 
                    src={colisData.colis.find((c: any) => c.name === showQRCode).image_url} 
                    alt="QR Code" 
                    className="mx-auto max-w-full h-auto"
                  />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium">{showQRCode}</p>
                    <p>Scannez ce QR code pour identifier le colis</p>
                  </div>
                  <Button
                    onClick={() => handlePrintQRCode(colisData.colis.find((c: any) => c.name === showQRCode))}
                    className="w-full"
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    Imprimer
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Aucun QR code disponible</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}