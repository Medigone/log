import { Flex, Heading, Text, Badge, Card, Table, Button, TextField, Select } from '@radix-ui/themes';
import React, { useState, useMemo, useEffect } from 'react';
import { CalendarIcon, PersonIcon, BoxIcon, MagnifyingGlassIcon, ChevronDownIcon, ChevronRightIcon } from '@radix-ui/react-icons';
import { Truck as TruckIcon, Package as PackageIcon, Eye as EyeIcon } from 'lucide-react';
import { useFrappeDocTypeEventListener, useFrappeGetDocList } from 'frappe-react-sdk';

// Types locaux
interface Colis {
  name: string;
  custom_numero_sequence?: string;
  status: string;
  client?: string;
  date?: string;
  date_creation?: string;
  bl: string;
  articles?: any[];
  articles_count?: number;
}

interface DeliveryNote {
  name: string;
  status: string;
  customer: string;
  posting_date: string;
  lr_date?: string;
  custom_nom_livreur?: string;
  custom_vehicule?: string;
  custom_nombre_colis?: number;
  custom_type?: string;
  custom_préparé?: boolean;
  grand_total?: number;
  colis?: Colis[];
  total_colis?: number;
  total_articles?: number;
}

type Filter = [string, string, any];

// Interface pour les données enrichies avec les colis
interface EnrichedDeliveryNote extends DeliveryNote {
  colis: Colis[];
}

interface DeliveryNotesListProps {
  onColisSelect?: (colisId: string) => void;
}

const DeliveryNotesList = ({ onColisSelect }: DeliveryNotesListProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pageLimitStart, setPageLimitStart] = useState(0);
  const [deliveryNotesWithColis, setDeliveryNotesWithColis] = useState<DeliveryNote[]>([]);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  // Filtres pour les bons de livraison
  const filters = useMemo(() => {
    const f: Filter[] = [];
    if (statusFilter) {
      f.push(['status', '=', statusFilter]);
    }
    if (searchTerm) {
      f.push(['customer', 'like', `%${searchTerm}%`]);
    }
    return f;
  }, [statusFilter, searchTerm]);

  // Récupération des bons de livraison
  const { data: deliveryNotesData, mutate: mutateDeliveryNotes, error } = useFrappeGetDocList<DeliveryNote>('Delivery Note', {
    fields: [
      'name', 
      'status', 
      'customer', 
      'posting_date', 
      'lr_date',
      'total_qty',
      'grand_total',
      'custom_nom_livreur'
    ],
    filters: filters,
    limit: 20,
    limit_start: pageLimitStart,
    orderBy: {
      field: 'posting_date',
      order: 'desc'
    }
  });

  // Récupération des colis pour tous les bons de livraison
  const { data: colisData, mutate: mutateAllColis } = useFrappeGetDocList<Colis>('Colis', {
    fields: [
      'name',
      'custom_numero_sequence',
      'status',
      'client',
      'date_creation',
      'bl',
      'articles'
    ],
    filters: deliveryNotesData ? [['bl', 'in', deliveryNotesData.map(dn => dn.name)]] : [],
    limit: 1000 // Limite élevée pour récupérer tous les colis
  });

  // Écouter les changements sur les doctypes
  useFrappeDocTypeEventListener('Delivery Note', () => {
    mutateDeliveryNotes();
  });

  useFrappeDocTypeEventListener('Colis', () => {
    mutateAllColis();
  });

  // Combiner les bons de livraison avec leurs colis
  useEffect(() => {
    if (deliveryNotesData && colisData) {
      const notesWithColis = deliveryNotesData.map(note => {
        const notesColis = colisData.filter(colis => colis.bl === note.name);
        
        // Calculer les totaux
        const total_colis = notesColis.length;
        const total_articles = note.total_qty || 0;

        return {
          ...note,
          colis: notesColis,
          total_colis,
          total_articles
        };
      });
      
      setDeliveryNotesWithColis(notesWithColis);
    }
  }, [deliveryNotesData, colisData]);

  const getStatusColor = (status: string) => {
    switch (status) {
      // Statuts des bons de livraison (anglais)
      case 'Draft': return 'blue';
      case 'To Deliver': return 'cyan';
      case 'Completed': return 'green';
      case 'Cancelled': return 'red';
      case 'Return Issued': return 'orange';
      
      // Statuts des colis (français)
      case 'Nouveau': return 'blue';
      case 'Préparé': return 'yellow';
      case 'Enlevé': return 'orange';
      case 'Partiellement Livré': return 'amber';
      case 'Livré': return 'green';
      case 'Non Livré': return 'red';
      case 'Annulé': return 'gray';
      
      default: return 'gray';
    }
  };

  const toggleNoteExpansion = (noteName: string) => {
    const newExpanded = new Set(expandedNotes);
    if (newExpanded.has(noteName)) {
      newExpanded.delete(noteName);
    } else {
      newExpanded.add(noteName);
    }
    setExpandedNotes(newExpanded);
  };

  const filteredDeliveryNotes = deliveryNotesWithColis.filter(note => 
    note.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    note.customer.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filtrer par terme de recherche (déjà fait dans deliveryNotesWithColis)
  const finalFilteredNotes = filteredDeliveryNotes;

  return (
    <div className="w-full p-2 sm:p-4">
      <div className="w-full max-w-7xl mx-auto">
        {/* En-tête */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <Flex align="center" justify="between" mb="4" className="flex-col sm:flex-row gap-2 sm:gap-0">
            <div className="text-center sm:text-left">
              <Heading size="6" className="sm:text-2xl" style={{ color: '#1e293b' }}>
                Bons de livraison
              </Heading>
              <Text size="2" className="sm:text-base" style={{ color: '#64748b' }}>
                Gestion des bons de livraison et colis associés
              </Text>
            </div>
            <Badge size="1" color="blue" className="text-xs sm:text-sm">
              {finalFilteredNotes.length} bon(s)
            </Badge>
          </Flex>
          
          {/* Barre de recherche */}
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
            <div className="flex-1 lg:flex-[3]">
              <TextField.Root
                size="3"
                placeholder="Rechercher par numéro de bon de livraison..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              >
                <TextField.Slot>
                  <MagnifyingGlassIcon height="18" width="18" />
                </TextField.Slot>
              </TextField.Root>
            </div>
            
            <div className="lg:flex-[1] lg:max-w-[200px]">
              <Select.Root
                size="3"
                value={statusFilter}
                onValueChange={setStatusFilter}
              >
                <Select.Trigger placeholder="Statut" className="w-full" />
                <Select.Content>
                  <Select.Item value="all">Tous les statuts</Select.Item>
                  <Select.Item value="Nouveau">Nouveau</Select.Item>
                  <Select.Item value="Préparé">Préparé</Select.Item>
                  <Select.Item value="Enlevé">Enlevé</Select.Item>
                  <Select.Item value="Partiellement Livré">Partiellement Livré</Select.Item>
                  <Select.Item value="Livré">Livré</Select.Item>
                  <Select.Item value="Non Livré">Non Livré</Select.Item>
                  <Select.Item value="Annulé">Annulé</Select.Item>
                </Select.Content>
              </Select.Root>
            </div>
          </div>
          
          {/* Affichage des erreurs */}
           {error && (
             <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
               <Text size="2" style={{ color: '#dc2626' }}>
                 Erreur lors du chargement des données : {error.message}
               </Text>
             </div>
           )}
        </div>

        {/* Vue desktop - Tableau */}
        <div className="hidden lg:block bg-white rounded-2xl shadow-lg overflow-hidden">
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Bon de livraison</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Client</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Livreur</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Date de livraison</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Statut</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Colis</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Articles</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Montant</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {finalFilteredNotes.map((note) => (
                <React.Fragment key={note.name}>
                  <Table.Row>
                    <Table.Cell>
                      <Text size="2" weight="bold" style={{ color: '#1e293b' }}>
                        {note.name}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" style={{ color: '#374151' }}>
                        {note.customer}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" style={{ color: '#374151' }}>
                        {note.custom_nom_livreur || 'Non assigné'}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" style={{ color: '#374151' }}>
                        {note.lr_date ? new Date(note.lr_date).toLocaleDateString('fr-FR') : new Date(note.posting_date).toLocaleDateString('fr-FR')}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge size="1" color={getStatusColor(note.status) as any}>
                        {note.status}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" weight="bold" style={{ color: '#1e293b' }}>
                        {note.total_colis || 0}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" weight="bold" style={{ color: '#1e293b' }}>
                        {note.total_articles || 0}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" weight="bold" style={{ color: '#1e293b' }}>
                        {note.grand_total ? `${note.grand_total.toLocaleString('fr-FR')} DZD` : 'N/A'}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Button
                        size="1"
                        variant="ghost"
                        onClick={() => toggleNoteExpansion(note.name)}
                      >
                        {expandedNotes.has(note.name) ? (
                          <ChevronDownIcon className="w-4 h-4" />
                        ) : (
                          <ChevronRightIcon className="w-4 h-4" />
                        )}
                        Colis
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                  
                  {/* Section des colis associés */}
                   {expandedNotes.has(note.name) && (
                     <Table.Row key={`${note.name}-expanded`}>
                       <Table.Cell colSpan={9}>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <Text size="2" weight="bold" mb="3" style={{ color: '#374151' }}>
                            Colis associés ({note.colis?.length || 0})
                          </Text>
                          
                          {note.colis && note.colis.length > 0 ? (
                            <div className="mt-3">
                              <Table.Root size="1" variant="surface">
                                <Table.Header>
                                  <Table.Row>
                                    <Table.ColumnHeaderCell>Séquence</Table.ColumnHeaderCell>
                                    <Table.ColumnHeaderCell>Client</Table.ColumnHeaderCell>
                                    <Table.ColumnHeaderCell>Statut</Table.ColumnHeaderCell>
                                    <Table.ColumnHeaderCell>Date</Table.ColumnHeaderCell>
                                    <Table.ColumnHeaderCell>Actions</Table.ColumnHeaderCell>
                                  </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                  {note.colis.map((colis) => (
                                    <Table.Row key={colis.name}>
                                      <Table.Cell>
                                        <Text size="2" weight="bold" style={{ color: '#1e293b' }}>
                                          {colis.custom_numero_sequence || colis.name}
                                        </Text>
                                      </Table.Cell>
                                      <Table.Cell>
                                        <Text size="2" style={{ color: '#374151' }}>
                                          {colis.client || 'Non défini'}
                                        </Text>
                                      </Table.Cell>
                                      <Table.Cell>
                                        <Badge size="1" color={getStatusColor(colis.status) as any}>
                                          {colis.status}
                                        </Badge>
                                      </Table.Cell>
                                      <Table.Cell>
                                        <Text size="2" style={{ color: '#64748b' }}>
                                          {colis.date_creation ? new Date(colis.date_creation).toLocaleDateString('fr-FR') : 'Date non définie'}
                                        </Text>
                                      </Table.Cell>
                                      <Table.Cell>
                                        <Button
                                          size="1"
                                          variant="soft"
                                          onClick={() => onColisSelect?.(colis.name)}
                                        >
                                          <EyeIcon size={14} />
                                          Voir détails
                                        </Button>
                                      </Table.Cell>
                                    </Table.Row>
                                  ))}
                                </Table.Body>
                              </Table.Root>
                            </div>
                          ) : (
                            <Text size="2" style={{ color: '#64748b' }}>
                              Aucun colis associé
                            </Text>
                          )}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </React.Fragment>
               ))}
            </Table.Body>
          </Table.Root>
        </div>

        {/* Vue mobile - Cartes */}
        <div className="lg:hidden space-y-3">
          {finalFilteredNotes.map((note) => (
            <div key={note.name} className="bg-white rounded-xl shadow-lg overflow-hidden">
              {/* En-tête de la carte */}
              <div className="p-4 border-b border-gray-100">
                <Flex align="center" justify="between" mb="2">
                  <div className="flex-1 min-w-0">
                    <Text size="2" weight="bold" style={{ color: '#1e293b' }} className="truncate">
                      {note.name}
                    </Text>
                    <Text size="1" style={{ color: '#64748b' }}>
                      {new Date(note.posting_date).toLocaleDateString('fr-FR')}
                    </Text>
                  </div>
                  <Badge size="1" color={getStatusColor(note.status) as any} className="ml-2">
                    {note.status}
                  </Badge>
                </Flex>
                
                {/* Informations principales */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <PersonIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <Text size="1" style={{ color: '#374151' }} className="truncate">
                      {note.customer}
                    </Text>
                  </div>
                  
                  {note.custom_nom_livreur && (
                    <div className="flex items-center gap-2">
                      <TruckIcon size={16} className="text-blue-500 flex-shrink-0" />
                      <Text size="1" style={{ color: '#374151' }} className="truncate">
                        {note.custom_nom_livreur}
                      </Text>
                    </div>
                  )}
                </div>
                
                {/* Statistiques */}
                <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-100">
                  <div className="text-center">
                    <Text size="1" style={{ color: '#64748b' }}>Colis : </Text>
                    <Text size="2" weight="bold" style={{ color: '#1e293b' }} className="mt-1">
                      {note.total_colis || 0}
                    </Text>
                  </div>
                  <div className="text-center">
                    <Text size="1" style={{ color: '#64748b' }}>Articles : </Text>
                    <Text size="2" weight="bold" style={{ color: '#1e293b' }} className="mt-1">
                      {note.total_articles || 0}
                    </Text>
                  </div>
                  <div className="text-center">
                    <Text size="1" style={{ color: '#64748b' }}>Montant : </Text>
                    <Text size="1" weight="bold" style={{ color: '#1e293b' }} className="mt-1">
                      {note.grand_total ? `${note.grand_total.toLocaleString('fr-FR')} DZD` : 'N/A'}
                    </Text>
                  </div>
                </div>
                
                {/* Bouton d'expansion */}
                <Button
                  size="2"
                  variant="ghost"
                  onClick={() => toggleNoteExpansion(note.name)}
                  className="w-full mt-4"
                >
                  {expandedNotes.has(note.name) ? (
                    <>
                      <ChevronDownIcon className="w-4 h-4 mr-1" />
                      Masquer les colis
                    </>
                  ) : (
                    <>
                      <ChevronRightIcon className="w-4 h-4 mr-1" />
                      Voir les colis ({note.colis?.length || 0})
                    </>
                  )}
                </Button>
              </div>
              
              {/* Section des colis associés */}
              {expandedNotes.has(note.name) && (
                <div className="p-4 bg-gray-50">
                  <Text size="2" weight="bold" mb="3" style={{ color: '#374151' }}>
                    Colis associés ({note.colis?.length || 0})
                  </Text>
                  
                  {note.colis && note.colis.length > 0 ? (
                    <div className="space-y-2">
                      {note.colis.map((colis) => (
                        <div key={colis.name} className="bg-white p-3 rounded-lg border border-gray-200">
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                              <Text size="2" weight="bold" style={{ color: '#1e293b' }} className="truncate flex-1">
                                {colis.custom_numero_sequence || colis.name}
                              </Text>
                              <Badge size="1" color={getStatusColor(colis.status) as any} className="ml-2">
                                {colis.status}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <Text size="1" style={{ color: '#64748b' }} className="truncate flex-1">
                                Client: {colis.client || 'Non défini'}
                              </Text>
                              <Button
                                size="1"
                                variant="soft"
                                onClick={() => onColisSelect?.(colis.name)}
                                className="ml-2"
                              >
                                <EyeIcon size={12} className="mr-1" />
                                Voir
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Text size="2" style={{ color: '#64748b' }}>
                      Aucun colis associé
                    </Text>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Message si aucun résultat */}
        {finalFilteredNotes.length === 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <BoxIcon className="w-12 h-12 mx-auto mb-4" style={{ color: '#9ca3af' }} />
            <Heading size="4" mb="2" style={{ color: '#374151' }}>
              Aucun bon de livraison trouvé
            </Heading>
            <Text size="3" style={{ color: '#64748b' }}>
              {searchTerm ? 'Essayez de modifier votre recherche' : 'Aucun bon de livraison disponible'}
            </Text>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliveryNotesList;