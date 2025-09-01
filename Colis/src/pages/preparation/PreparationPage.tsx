import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  Package,
  Plus,
  Minus,
  CheckCircle,
  AlertTriangle,
  Truck,
  Calendar,
  User,
  FileText
} from 'lucide-react';
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk';

/* =========================
   Types
   ========================= */
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
}

interface UnpackedDeliveryNote {
  name: string;
  customer: string;
  posting_date: string;
  grand_total: number;
  total_colis: number;
  unpacked_items_count: number;
  unpacked_items: any[];
}

interface SelectedItem {
  item_code: string;
  item_name: string;
  selected_quantity: number;
  available_quantity: number;
  uom: string;
}

/* =========================
   Helper Functions
   ========================= */
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
  });
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount) + ' DZD';
}

/* =========================
   Main Component
   ========================= */
interface PreparationPageProps {
  onBack?: () => void;
}

export function PreparationPage({ onBack }: PreparationPageProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDeliveryNote, setSelectedDeliveryNote] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Récupérer les bons de livraison non emballés
  const { data: unpackedNotes, error: notesError, mutate: refreshNotes } = useFrappeGetCall<{
    success: boolean;
    unpacked_delivery_notes: UnpackedDeliveryNote[];
    total_count: number;
  }>('log.log.doctype.colis.colis.get_unpacked_delivery_notes', {
    date_from: null,
    date_to: null,
    customer: null
  });

  // Récupérer les articles d'un bon de livraison
  const { data: deliveryNoteItems, error: itemsError, mutate: refreshItems } = useFrappeGetCall<{
    success: boolean;
    delivery_note: DeliveryNoteInfo;
    items: DeliveryNoteItem[];
  }>('log.log.doctype.colis.colis.get_delivery_note_items_for_colis', {
    delivery_note_name: selectedDeliveryNote
  }, selectedDeliveryNote ? undefined : null);

  // Créer un colis
  const { call: createColis } = useFrappePostCall('log.log.doctype.colis.colis.create_colis_from_delivery_note');

  // Filtrer les bons de livraison
  const filteredNotes = unpackedNotes?.unpacked_delivery_notes?.filter(note =>
    note.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    note.customer.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  // Gérer la sélection d'un bon de livraison
  const handleSelectDeliveryNote = (noteName: string) => {
    setSelectedDeliveryNote(noteName);
    setSelectedItems([]);
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  // Gérer la sélection d'articles
  const handleItemQuantityChange = (itemCode: string, quantity: number) => {
    const item = deliveryNoteItems?.items?.find(i => i.item_code === itemCode);
    if (!item) return;

    const maxQuantity = item.available_quantity;
    const validQuantity = Math.max(0, Math.min(quantity, maxQuantity));

    setSelectedItems(prev => {
      const existing = prev.find(i => i.item_code === itemCode);
      if (existing) {
        if (validQuantity === 0) {
          return prev.filter(i => i.item_code !== itemCode);
        }
        return prev.map(i => 
          i.item_code === itemCode 
            ? { ...i, selected_quantity: validQuantity }
            : i
        );
      } else if (validQuantity > 0) {
        return [...prev, {
          item_code: itemCode,
          item_name: item.item_name,
          selected_quantity: validQuantity,
          available_quantity: item.available_quantity,
          uom: item.uom
        }];
      }
      return prev;
    });
  };

  // Créer le colis
  const handleCreateColis = async () => {
    if (!selectedDeliveryNote || selectedItems.length === 0) return;

    setIsCreating(true);
    setErrorMessage(null);

    try {
      const articlesData = selectedItems.map(item => ({
        item_code: item.item_code,
        quantity: item.selected_quantity
      }));

      const result = await createColis({
        delivery_note_name: selectedDeliveryNote,
        articles_data: articlesData
      });

      if (result.success) {
        setSuccessMessage(`Colis ${result.colis_name} créé avec succès !`);
        setSelectedItems([]);
        refreshNotes();
        refreshItems();
      } else {
        setErrorMessage(result.message || 'Erreur lors de la création du colis');
      }
    } catch (error) {
      setErrorMessage('Erreur lors de la création du colis');
      console.error('Erreur création colis:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Préparation de Colis</h1>
          <p className="text-muted-foreground mt-1">
            Sélectionnez un bon de livraison et les articles à emballer
          </p>
        </div>
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            Retour
          </Button>
        )}
      </div>

      {/* Messages */}
      {successMessage && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            {successMessage}
          </AlertDescription>
        </Alert>
      )}

      {errorMessage && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            {errorMessage}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Liste des bons de livraison */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Bons de Livraison Non Emballés
              <Badge variant="secondary">
                {filteredNotes.length}
              </Badge>
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Rechercher par numéro ou client..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredNotes.map((note) => (
                <div
                  key={note.name}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedDeliveryNote === note.name
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
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

        {/* Articles du bon de livraison sélectionné */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Articles à Emballer
              {selectedItems.length > 0 && (
                <Badge variant="secondary">
                  {selectedItems.length} sélectionnés
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedDeliveryNote ? (
              <div className="space-y-4">
                {/* Info du bon de livraison */}
                {deliveryNoteItems?.delivery_note && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="font-medium text-blue-900">
                      {deliveryNoteItems.delivery_note.name}
                    </div>
                    <div className="text-sm text-blue-700 mt-1">
                      Client: {deliveryNoteItems.delivery_note.customer}
                    </div>
                  </div>
                )}

                {/* Liste des articles */}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {deliveryNoteItems?.items?.map((item) => {
                    const selectedItem = selectedItems.find(s => s.item_code === item.item_code);
                    const selectedQuantity = selectedItem?.selected_quantity || 0;
                    
                    return (
                      <div key={item.item_code} className="p-3 border rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="font-medium text-sm">{item.item_name}</div>
                            <div className="text-xs text-muted-foreground">
                              Code: {item.item_code}
                            </div>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <div>Disponible: {item.available_quantity} {item.uom}</div>
                            <div>Total: {item.total_quantity} {item.uom}</div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleItemQuantityChange(item.item_code, selectedQuantity - 1)}
                            disabled={selectedQuantity <= 0}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          
                          <Input
                            type="number"
                            min="0"
                            max={item.available_quantity}
                            value={selectedQuantity}
                            onChange={(e) => handleItemQuantityChange(item.item_code, parseInt(e.target.value) || 0)}
                            className="w-20 text-center"
                          />
                          
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleItemQuantityChange(item.item_code, selectedQuantity + 1)}
                            disabled={selectedQuantity >= item.available_quantity}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                          
                          <span className="text-sm text-muted-foreground ml-2">
                            {item.uom}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bouton de création */}
                {selectedItems.length > 0 && (
                  <div className="pt-4 border-t">
                    <Button
                      onClick={handleCreateColis}
                      disabled={isCreating}
                      className="w-full"
                    >
                      {isCreating ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                          Création en cours...
                        </>
                      ) : (
                        <>
                          <Package className="h-4 w-4 mr-2" />
                          Créer le Colis ({selectedItems.length} articles)
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Truck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Sélectionnez un bon de livraison pour voir les articles</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default PreparationPage;