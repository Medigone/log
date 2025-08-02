import { Flex, Heading, Text, Badge, Card, Table, Button, TextField, Select } from '@radix-ui/themes';
import React, { useState, useMemo, useEffect } from 'react';
import { CalendarIcon, PersonIcon, BoxIcon, MagnifyingGlassIcon, ChevronDownIcon, ChevronRightIcon } from '@radix-ui/react-icons';
import { Truck as TruckIcon, Package as PackageIcon, Eye as EyeIcon } from 'lucide-react';
import { useFrappeDocTypeEventListener, useFrappeGetDocList } from 'frappe-react-sdk';

// Types locaux
interface LivraisonColis {
  name: string;
  colis: string;
  numero_sequence?: string;
  client?: string;
  bon_de_livraison?: string;
  status: string;
}

interface LivraisonBonDeLivraison {
  name: string;
  bon_de_livraison: string;
  custom_commune?: string;
  custom_nom_livreur?: string;
  custom_vehicule?: string;
  custom_nombre_colis?: number;
  grand_total?: number;
  total_qty?: number;
}

interface Livraison {
  name: string;
  date_liv: string;
  status: string;
  livreur?: string;
  vehicule?: string;
  total_colis?: number;
  total_montant_a_encaisser?: number;
  total_paiements?: number;
  solde_restant?: number;
  creation?: string;
  modified?: string;
  colis?: LivraisonColis[];
  bons_de_livraison?: LivraisonBonDeLivraison[];
}

type Filter = [string, '=' | 'like' | 'in', any];

interface LivraisonsListProps {
  onLivraisonSelect?: (livraisonId: string) => void;
}

const LivraisonsList = ({ onLivraisonSelect }: LivraisonsListProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pageLimitStart, setPageLimitStart] = useState(0);
  const [livraisonsWithDetails, setLivraisonsWithDetails] = useState<Livraison[]>([]);
  const [expandedLivraisons, setExpandedLivraisons] = useState<Set<string>>(new Set());

  // Filtres pour les livraisons
  const filters = useMemo(() => {
    const f: any[] = [];
    if (statusFilter && statusFilter !== 'all') {
      f.push(['status', '=', statusFilter]);
    }
    if (searchTerm) {
      // Recherche dans le nom de la livraison
      f.push(['name', 'like', `%${searchTerm}%`]);
    }
    return f;
  }, [statusFilter, searchTerm]);

  // Récupération des livraisons
  const { data: livraisonsData, mutate: mutateLivraisons, error } = useFrappeGetDocList<Livraison>('Livraison', {
    fields: [
      'name',
      'date_liv',
      'status',
      'livreur',
      'vehicule',
      'total_colis',
      'total_montant_a_encaisser',
      'total_paiements',
      'solde_restant',
      'creation',
      'modified'
    ],
    filters: filters,
    limit: 20,
    limit_start: pageLimitStart,
    orderBy: {
      field: 'creation',
      order: 'desc'
    }
  });

  // Récupération des colis pour toutes les livraisons
  const { data: colisData, mutate: mutateAllColis } = useFrappeGetDocList<any>('Colis', {
    fields: [
      'name',
      'custom_numero_sequence',
      'status',
      'client',
      'date_creation',
      'bl',
      'articles'
    ],
    filters: livraisonsData ? [['bl', 'in', livraisonsData.map(l => l.name)]] : [],
    limit: 1000 // Limite élevée pour récupérer tous les colis
  });

  // Écouter les changements sur les doctypes
  useFrappeDocTypeEventListener('Livraison', () => {
    mutateLivraisons();
  });

  useFrappeDocTypeEventListener('Colis', () => {
    mutateAllColis();
  });

  // Combiner les livraisons avec leurs données enfants
  useEffect(() => {
    if (livraisonsData && colisData) {
      const enriched = livraisonsData.map(livraison => {
        // Trouver les colis liés à cette livraison
        const livraisonColis = colisData.filter(colis => colis.bl === livraison.name);
        
        return {
          ...livraison,
          colis: livraisonColis,
          bons_de_livraison: []
        };
      });
      
      setLivraisonsWithDetails(enriched);
    }
  }, [livraisonsData, colisData]);

  // Fonction pour traduire les statuts en français
  const translateStatus = (status: string) => {
    switch (status) {
      case 'Nouveau': return 'Nouveau';
      case 'Préparé': return 'Préparé';
      case 'Partiellement Préparé': return 'Partiellement Préparé';
      case 'Enlevé': return 'Enlevé';
      case 'Partiellement Enlevé': return 'Partiellement Enlevé';
      case 'Partiellement Livré': return 'Partiellement Livré';
      case 'Livré': return 'Livré';
      case 'Annulé': return 'Annulé';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Nouveau': return 'blue';
      case 'Préparé': return 'purple';
      case 'Partiellement Préparé': return 'violet';
      case 'Enlevé': return 'orange';
      case 'Partiellement Enlevé': return 'yellow';
      case 'Partiellement Livré': return 'amber';
      case 'Livré': return 'green';
      case 'Annulé': return 'red';
      default: return 'gray';
    }
  };

  const toggleLivraisonExpansion = (livraisonName: string) => {
    const newExpanded = new Set(expandedLivraisons);
    if (newExpanded.has(livraisonName)) {
      newExpanded.delete(livraisonName);
    } else {
      newExpanded.add(livraisonName);
    }
    setExpandedLivraisons(newExpanded);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatAmount = (amount: number | undefined) => {
    if (!amount) return '0,00';
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'DZD'
    }).format(amount);
  };

  const filteredLivraisons = livraisonsWithDetails.filter(livraison => 
    livraison.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const finalFilteredLivraisons = filteredLivraisons;

  return (
    <div className="w-full p-2 sm:p-4">
      <div className="w-full max-w-7xl mx-auto">
        {/* En-tête */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <Flex align="center" justify="between" mb="4" className="flex-col sm:flex-row gap-2 sm:gap-0">
            <div className="text-center sm:text-left">
              <Heading size="6" className="sm:text-2xl" style={{ color: '#1e293b' }}>
                Livraisons
              </Heading>
              <Text size="2" className="sm:text-base" style={{ color: '#64748b' }}>
                Gestion des livraisons et colis associés
              </Text>
            </div>
            <Badge size="1" color="blue" className="text-xs sm:text-sm">
              {finalFilteredLivraisons.length} livraison(s)
            </Badge>
          </Flex>
          
          {/* Barre de recherche */}
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
            <div className="flex-1 lg:flex-[3]">
              <TextField.Root
                size="3"
                placeholder="Rechercher par numéro de livraison..."
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
                  <Select.Item value="Partiellement Préparé">Partiellement Préparé</Select.Item>
                  <Select.Item value="Enlevé">Enlevé</Select.Item>
                  <Select.Item value="Partiellement Enlevé">Partiellement Enlevé</Select.Item>
                  <Select.Item value="Partiellement Livré">Partiellement Livré</Select.Item>
                  <Select.Item value="Livré">Livré</Select.Item>
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
        <div className="hidden lg:block" style={{ backgroundColor: 'white', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <Table.Root>
            <Table.Header>
              <Table.Row style={{ backgroundColor: '#1e293b' }}>
                <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none' }}>Livraison</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none' }}>Livreur</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none' }}>Véhicule</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none' }}>Date de livraison</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none' }}>Statut</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none' }}>Colis</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none' }}>Montant</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell style={{ color: 'white', fontWeight: '600', padding: '16px', borderBottom: 'none' }}>Actions</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {finalFilteredLivraisons.map((livraison, index) => (
                <React.Fragment key={livraison.name}>
                  <Table.Row 
                    style={{ 
                      backgroundColor: index % 2 === 0 ? 'white' : '#f8fafc', 
                      transition: 'background-color 0.2s', 
                      cursor: 'pointer' 
                    }} 
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'} 
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'white' : '#f8fafc'}
                    onClick={() => toggleLivraisonExpansion(livraison.name)}
                  >
                    <Table.Cell>
                      <Text size="2" weight="bold" style={{ color: '#1e293b' }}>
                        {livraison.name}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" style={{ color: '#374151' }}>
                        {livraison.livreur || '-'}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" style={{ color: '#374151' }}>
                        {livraison.vehicule || '-'}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" style={{ color: '#374151' }}>
                        {formatDate(livraison.date_liv)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge color={getStatusColor(livraison.status)} size="1">
                        {translateStatus(livraison.status)}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" style={{ color: '#374151' }}>
                        {livraison.total_colis || 0}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" style={{ color: '#374151' }}>
                        {formatAmount(livraison.total_montant_a_encaisser)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      <Flex gap="2">
                        <Button
                          size="1"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            onLivraisonSelect?.(livraison.name);
                          }}
                        >
                          <EyeIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          size="1"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLivraisonExpansion(livraison.name);
                          }}
                        >
                          {expandedLivraisons.has(livraison.name) ? (
                            <ChevronDownIcon className="w-4 h-4" />
                          ) : (
                            <ChevronRightIcon className="w-4 h-4" />
                          )}
                        </Button>
                      </Flex>
                    </Table.Cell>
                  </Table.Row>
                  
                  {/* Détails étendus */}
                  {expandedLivraisons.has(livraison.name) && (
                    <Table.Row style={{ backgroundColor: '#f8fafc' }}>
                      <Table.Cell colSpan={8}>
                        <div className="p-4">
                          <Flex direction="column" gap="4">
                            
                            
                                                         {/* Colis */}
                             {livraison.colis && livraison.colis.length > 0 && (
                               <div>
                                 <Text size="2" weight="bold" style={{ color: '#1e293b', marginBottom: '8px' }}>
                                   Colis ({livraison.colis.length})
                                 </Text>
                                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                   {livraison.colis.map((colis: any) => (
                                     <div key={colis.name} className="p-2 bg-white rounded border">
                                       <Text size="2" style={{ color: '#374151' }}>
                                         {colis.custom_numero_sequence || colis.name}
                                         {colis.client && ` - ${colis.client}`}
                                       </Text>
                                       <Text size="1" style={{ color: '#6b7280' }}>
                                         {colis.status} - {formatDate(colis.date_creation)}
                                       </Text>
                                     </div>
                                   ))}
                                 </div>
                               </div>
                             )}
                          </Flex>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </React.Fragment>
              ))}
            </Table.Body>
          </Table.Root>
        </div>

        {/* Vue mobile - Cards */}
        <div className="lg:hidden space-y-4">
          {finalFilteredLivraisons.map((livraison) => (
            <Card key={livraison.name} className="p-4">
              <Flex direction="column" gap="3">
                {/* En-tête de la livraison */}
                <Flex align="center" justify="between">
                  <Flex align="center" gap="3">
                    <Button
                      variant="ghost"
                      size="1"
                      onClick={() => toggleLivraisonExpansion(livraison.name)}
                    >
                      {expandedLivraisons.has(livraison.name) ? (
                        <ChevronDownIcon width="16" height="16" />
                      ) : (
                        <ChevronRightIcon width="16" height="16" />
                      )}
                    </Button>
                    
                    <div>
                      <Text size="3" weight="bold" style={{ color: '#1e293b' }}>
                        {livraison.name}
                      </Text>
                      <Text size="1" style={{ color: '#64748b' }}>
                        {formatDate(livraison.date_liv)}
                      </Text>
                    </div>
                  </Flex>

                  <Flex align="center" gap="2">
                    <Badge color={getStatusColor(livraison.status)} size="1">
                      {translateStatus(livraison.status)}
                    </Badge>
                    
                    <Button
                      size="1"
                      onClick={() => onLivraisonSelect?.(livraison.name)}
                    >
                      <EyeIcon className="w-4 h-4" />
                    </Button>
                  </Flex>
                </Flex>

                {/* Informations de base */}
                <Flex gap="4" wrap="wrap">
                  {livraison.livreur && (
                    <Flex align="center" gap="2">
                      <PersonIcon className="w-4 h-4" style={{ color: '#6b7280' }} />
                      <Text size="2" style={{ color: '#374151' }}>
                        {livraison.livreur}
                      </Text>
                    </Flex>
                  )}
                  
                  {livraison.vehicule && (
                    <Flex align="center" gap="2">
                      <Text size="2">🚗</Text>
                      <Text size="2" style={{ color: '#374151' }}>
                        {livraison.vehicule}
                      </Text>
                    </Flex>
                  )}
                  
                  <Flex align="center" gap="2">
                    <PackageIcon className="w-4 h-4" style={{ color: '#6b7280' }} />
                    <Text size="2" style={{ color: '#374151' }}>
                      {livraison.total_colis || 0} colis
                    </Text>
                  </Flex>
                  
                  <Text size="2" weight="bold" style={{ color: '#059669' }}>
                    {formatAmount(livraison.total_montant_a_encaisser)}
                  </Text>
                </Flex>

                {/* Détails étendus */}
                {expandedLivraisons.has(livraison.name) && (
                  <div className="pt-3 border-t border-gray-200">
                    <Flex direction="column" gap="3">
                      
                      
                                             {/* Colis */}
                       {livraison.colis && livraison.colis.length > 0 && (
                         <div>
                           <Text size="2" weight="bold" style={{ color: '#1e293b', marginBottom: '4px' }}>
                             Colis ({livraison.colis.length})
                           </Text>
                           <div className="space-y-2">
                             {livraison.colis.map((colis: any) => (
                               <div key={colis.name} className="p-2 bg-gray-50 rounded">
                                 <Text size="2" style={{ color: '#374151' }}>
                                   {colis.custom_numero_sequence || colis.name}
                                   {colis.client && ` - ${colis.client}`}
                                 </Text>
                                 <Text size="1" style={{ color: '#6b7280' }}>
                                   {colis.status} - {formatDate(colis.date_creation)}
                                 </Text>
                               </div>
                             ))}
                           </div>
                         </div>
                       )}
                    </Flex>
                  </div>
                )}
              </Flex>
            </Card>
          ))}
        </div>

        {/* Pagination */}
        {finalFilteredLivraisons.length === 20 && (
          <div className="flex justify-center gap-2 mt-6">
            <Button
              variant="outline"
              disabled={pageLimitStart === 0}
              onClick={() => setPageLimitStart(Math.max(0, pageLimitStart - 20))}
            >
              Précédent
            </Button>
            <Button
              variant="outline"
              onClick={() => setPageLimitStart(pageLimitStart + 20)}
            >
              Suivant
            </Button>
          </div>
        )}

        {/* Message si aucune livraison */}
        {finalFilteredLivraisons.length === 0 && (
          <Card className="p-8 text-center">
            <PackageIcon className="w-12 h-12" style={{ color: '#9ca3af', margin: '0 auto 16px' }} />
            <Heading size="4" style={{ color: '#6b7280', marginBottom: '8px' }}>
              Aucune livraison trouvée
            </Heading>
            <Text size="2" style={{ color: '#9ca3af' }}>
              Essayez de modifier vos critères de recherche
            </Text>
          </Card>
        )}
      </div>
    </div>
  );
};

export default LivraisonsList;