import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Truck, 
  Play, 
  Check, 
  RefreshCw, 
  RotateCcw, 
  Edit, 
  Save, 
  X,
  Users,
  User,
  List,
  AlertTriangle,
  Info,
  Dot,
  Package,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Calendar,
  Clipboard
} from 'lucide-react';
import { useFrappePostCall, useFrappeGetDocList } from 'frappe-react-sdk';

interface LivraisonData {
  livraisons_creees?: any[];
  repartition?: {
    [livreurNom: string]: {
      livreur: string;
      total_colis: number;
      total_bons: number;
      taux_charge: number;
      communes?: string[];
      bons_de_livraison?: Array<{ bon_de_livraison: string }>;
    };
  };
  total_bons_date?: number;
  livreurs_disponibles?: any[];
  communes_data?: any[];
  simulate?: boolean;
}

interface GenerationLivraisonsProps {
  onBack?: () => void;
}

const GenerationLivraisons: React.FC<GenerationLivraisonsProps> = ({ onBack }) => {
  const [dateLivraison, setDateLivraison] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  // Mode simulation forcé par défaut - plus de checkbox
  const modeSimulation = true;
  const [currentData, setCurrentData] = useState<LivraisonData | null>(null);
  const [showResults, setShowResults] = useState<boolean>(false);
  const [showManualInterface, setShowManualInterface] = useState<boolean>(false);
  const [manualAssignments, setManualAssignments] = useState<{[key: string]: string}>({});
  const [expandedItems, setExpandedItems] = useState<{[key: string]: boolean}>({});

  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState<'success' | 'error' | 'warning' | 'info'>('info');

  // Fonction pour basculer l'expansion d'un élément
  const toggleExpansion = (key: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Fonction pour déterminer la couleur du badge de charge
  const getChargeColor = (chargePercentage: number): string => {
    if (chargePercentage <= 60) {
      return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800';
    } else if (chargePercentage <= 85) {
      return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800';
    } else {
      return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
    }
  };

  // Composant pour afficher une liste avec expansion
  const ExpandableList = ({ items, maxDisplay = 3, keyPrefix, renderItem, separator = ', ' }: {
    items: any[];
    maxDisplay?: number;
    keyPrefix: string;
    renderItem?: (item: any) => string;
    separator?: string;
  }) => {
    const isExpanded = expandedItems[keyPrefix];
    const displayItems = renderItem ? items.map(renderItem) : items;
    
    if (items.length <= maxDisplay) {
      return <span>{displayItems.join(separator)}</span>;
    }
    
    if (isExpanded) {
      return (
        <span>
          {displayItems.join(separator)}
          <button 
            onClick={() => toggleExpansion(keyPrefix)}
            className="ml-2 text-primary hover:underline text-xs font-medium transition-colors inline-flex items-center gap-1"
          >
            <ChevronUp className="h-3 w-3" />
            Voir moins
          </button>
        </span>
      );
    } else {
      return (
        <span>
          {displayItems.slice(0, maxDisplay).join(separator)}
          <button 
            onClick={() => toggleExpansion(keyPrefix)}
            className="ml-2 text-primary hover:underline text-xs font-medium transition-colors inline-flex items-center gap-1"
          >
            <ChevronDown className="h-3 w-3" />
            +{items.length - maxDisplay} autres
          </button>
        </span>
      );
    }
  };

  // Composant pour afficher une liste de bons avec détails
  const ExpandableBonsList = ({ bons, maxDisplay = 3, keyPrefix }: {
    bons: any[];
    maxDisplay?: number;
    keyPrefix: string;
  }) => {
    const isExpanded = expandedItems[keyPrefix];
    
    if (bons.length <= maxDisplay) {
      return (
        <ul className="list-disc list-inside">
          {bons.map((bon: any, idx: number) => (
            <li key={idx} className="text-sm">
              <span className="font-medium">{bon.name}</span> 
              <span className="text-muted-foreground">({bon.total_qty} colis)</span>
            </li>
          ))}
        </ul>
      );
    }
    
    return (
      <div>
        <ul className="list-disc list-inside">
          {(isExpanded ? bons : bons.slice(0, maxDisplay)).map((bon: any, idx: number) => (
            <li key={idx} className="text-sm">
              <span className="font-medium">{bon.name}</span> 
              <span className="text-muted-foreground">({bon.total_qty} colis)</span>
            </li>
          ))}
        </ul>
        <button 
          onClick={() => toggleExpansion(keyPrefix)}
          className="mt-1 text-primary hover:underline text-xs font-medium transition-colors flex items-center gap-1"
        >
          {isExpanded ? (
            <><ChevronUp className="h-3 w-3" />Voir moins</>
          ) : (
            <><ChevronDown className="h-3 w-3" />+{bons.length - maxDisplay} autres bons</>
          )}
        </button>
      </div>
    );
  };

  // Composant MetaChip pour une présentation cohérente
  const MetaChip = ({ icon: Icon, label, value, className = "" }: {
    icon: React.ComponentType<any>;
    label: string;
    value: string | number;
    className?: string;
  }) => (
    <div className={`inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 sm:py-2.5 bg-card/60 border border-border rounded-xl leading-none ${className}`}>
      <Icon className="w-4 h-4 text-foreground" />
      <span className="inline-flex items-baseline gap-1 sm:gap-1.5 text-foreground text-xs sm:text-sm">
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className="font-semibold">{value}</span>
      </span>
    </div>
  );

  // Composant pour afficher les communes et bons de livraison
  const HierarchicalDisplay = ({ repartition, keyPrefix, communesMapping }: { repartition: any, keyPrefix: string, communesMapping: Record<string, string> }) => {
    // Extraire les communes uniques
     const communes = [...new Set(repartition.bons_de_livraison?.map((bon: any) => bon.commune || 'Non spécifiée') || [])] as string[];
     const communesNoms = communes.map((communeId: string) => communeId !== 'Non spécifiée' ? (communesMapping[communeId] || communeId) : communeId);
    
    return (
       <div className="space-y-4">
         {/* Liste des bons de livraison */}
         <div>
           <h4 className="font-medium text-foreground mb-2">Bons de livraison:</h4>
           <div className="space-y-1">
             {repartition.bons_de_livraison?.map((bon: any, index: number) => (
               <div key={`${keyPrefix}-bon-${index}`} className="p-2 bg-card/30 rounded border space-y-2">
                 <div className="flex flex-col">
                   {bon.customer && (
                     <span className="font-semibold text-lg text-foreground">
                       {customersMapping[bon.customer] || bon.customer}
                     </span>
                   )}
                   <span className="text-sm font-mono text-muted-foreground">{bon.bon_de_livraison}</span>
                 </div>
                 <div className="flex flex-wrap items-center gap-2">
                   <Badge 
                      variant="outline" 
                      className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 font-medium text-xs"
                    >
                      {bon.commune !== 'Non spécifiée' ? (communesMapping[bon.commune] || bon.commune) : 'Non spécifiée'}
                    </Badge>
                   <Badge 
                     variant="outline" 
                     className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 font-medium text-xs"
                   >
                     {bon.total_colis || bon.custom_nombre_colis || 0} colis
                   </Badge>
                 </div>
               </div>
             )) || []}
           </div>
         </div>
       </div>
     );
  };
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Hooks pour les appels API
  const { call: callRepartition } = useFrappePostCall('log.utils.distribution.repartir_livraisons_automatique');
  const { call: callSynchronisation } = useFrappePostCall('log.utils.distribution.synchroniser_livraisons_existantes');
  const { call: callForcerSync } = useFrappePostCall('log.utils.distribution.forcer_synchronisation_livraisons');
  const { call: callCorrigerCharges } = useFrappePostCall('log.utils.distribution.corriger_charges_livreurs');

  // Récupération des communes pour mapper les IDs aux noms
  const { data: communesData } = useFrappeGetDocList<any>('Commune', {
    fields: ['name', 'nom'],
    limit: 0 // 0 = pas de limite, récupérer toutes les communes
  });

  // Récupération des clients pour mapper les IDs aux noms
  const { data: customersData } = useFrappeGetDocList<any>('Customer', {
    fields: ['name', 'customer_name'],
    limit: 0 // 0 = pas de limite, récupérer tous les clients
  });

  // Création d'un mapping des communes
  const communesMapping = useMemo(() => {
    if (!communesData) return {};
    return communesData.reduce((acc, commune) => {
      acc[commune.name] = commune.nom;
      return acc;
    }, {} as Record<string, string>);
  }, [communesData]);

  // Création d'un mapping des clients
  const customersMapping = useMemo(() => {
    if (!customersData) return {};
    return customersData.reduce((acc, customer) => {
      acc[customer.name] = customer.customer_name;
      return acc;
    }, {} as Record<string, string>);
  }, [customersData]);

  const genererRepartition = async () => {
    if (!dateLivraison) {
      showAlert('Veuillez sélectionner une date de livraison', 'warning');
      return;
    }

    setIsLoading(true);
    try {
      const result = await callRepartition({
        date_livraison: dateLivraison,
        mode: 'auto',
        simulate: modeSimulation,
        manual_assignments: Object.keys(manualAssignments).length > 0 ? manualAssignments : null
      });

      if (result?.message) {
        setCurrentData(result.message);
        setShowResults(true);
        
        if (result.message.simulate && result.message.communes_data?.length > 0) {
          // Mode manuel nécessaire
          setShowManualInterface(true);
        }
      }
    } catch (error) {
      console.error('Erreur lors de la génération:', error);
      showAlert('Erreur lors de la génération de la répartition', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const confirmerRepartition = async () => {
    if (!currentData || !currentData.simulate) {
      showAlert('Aucune simulation à confirmer', 'warning');
      return;
    }

    setIsLoading(true);
    try {
      const result = await callRepartition({
        date_livraison: dateLivraison,
        mode: 'auto',
        simulate: false,
        manual_assignments: Object.keys(manualAssignments).length > 0 ? manualAssignments : null
      });

      if (result?.message) {
        setCurrentData(result.message);
        const nbLivraisons = result.message.livraisons_creees?.length || 0;
        showAlert(`${nbLivraisons} livraisons créées avec succès`, 'success');
        
        // Réinitialiser après confirmation
        setTimeout(() => {
          resetInterface();
        }, 2000);
      }
    } catch (error) {
      console.error('Erreur lors de la confirmation:', error);
      showAlert('Erreur lors de la création des livraisons', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const synchroniserLivraisons = async () => {
    if (!dateLivraison) {
      showAlert('Veuillez sélectionner une date de livraison', 'warning');
      return;
    }

    setIsLoading(true);
    try {
      const result = await callSynchronisation({
        date_livraison: dateLivraison
      });

      if (result?.message?.success) {
        showAlert('Synchronisation terminée avec succès !', 'success');
        // Rafraîchir les données après synchronisation
        setTimeout(() => {
          genererRepartition();
        }, 1000);
      }
    } catch (error) {
      console.error('Erreur lors de la synchronisation:', error);
      showAlert('Erreur lors de la synchronisation', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const resetInterface = () => {
    setCurrentData(null);
    setShowResults(false);
    setShowManualInterface(false);
    setManualAssignments({});
    setDateLivraison(new Date().toISOString().split('T')[0]);
    // Mode simulation toujours activé
  };

  const showAlert = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setAlertMessage(message);
    setAlertType(type);
    setShowAlertModal(true);
  };

  const appliquerAssignationsManuelles = () => {
    setShowManualInterface(false);
    genererRepartition();
  };

  const annulerAssignationsManuelles = () => {
    setManualAssignments({});
    setShowManualInterface(false);
  };

  const handleManualAssignment = (commune: string, livreurId: string) => {
    setManualAssignments(prev => ({
      ...prev,
      [commune]: livreurId
    }));
  };

  const corrigerChargesLivreurs = async () => {
    setIsLoading(true);
    try {
      const result = await callCorrigerCharges({});
      if (result?.message) {
        showAlert(`Charges corrigées: ${result.message.message}`, 'success');
        // Régénérer la répartition pour voir les nouveaux pourcentages
        if (showResults) {
          genererRepartition();
        }
      }
    } catch (error) {
      console.error('Erreur lors de la correction des charges:', error);
      showAlert('Erreur lors de la correction des charges', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const formatAmount = (amount: number | undefined) => {
    if (!amount) return '0,00 DZD';
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount) + ' DZD';
  };

  return (
    <div className="bg-background min-h-screen">
      {/* Header */}
      <div className="border-b border-border">
        <div className="max-w-6xl mx-auto px-2 sm:px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap justify-between sm:justify-between justify-start">
            <div className="inline-flex items-center gap-2 text-muted-foreground text-xs sm:text-sm">
              {onBack && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onBack}
                  className="border-border text-foreground bg-card/50 hover:bg-accent"
                >
                  <X className="w-4 h-4" />
                  Retour
                </Button>
              )}
              <span>Livraisons</span>
              <Dot className="w-4 h-4" />
              <span>Génération</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="inline-flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 sm:py-2.5 bg-card/60 border border-border rounded-xl leading-none">
                <Truck className="h-4 w-4 text-foreground" />
                <span className="text-foreground text-xs sm:text-sm font-semibold">Génération des Livraisons</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-2 sm:px-4 pt-6 pb-8">

        {/* Paramètres de répartition */}
        <Card className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden p-3 sm:p-6">
        <div className="space-y-4">
            <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2 text-foreground">
              <Play className="h-5 w-5 text-primary" />
              Paramètres de Répartition
            </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="date_livraison" className="text-sm font-medium">
                Date de livraison
              </label>
              <Input
                id="date_livraison"
                type="date"
                value={dateLivraison}
                onChange={(e) => setDateLivraison(e.target.value)}
                className="w-full"
              />
            </div>
            

          </div>

          <div className="flex flex-col sm:flex-row flex-wrap gap-3 pt-4">
            <Button 
              onClick={genererRepartition} 
              disabled={isLoading}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg transition-all duration-200 hover:shadow-xl"
            >
              {isLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {isLoading ? 'Génération en cours...' : 'Générer Aperçu'}
            </Button>
            
            {showResults && currentData?.simulate && (
              <Button 
                onClick={confirmerRepartition}
                variant="default"
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white shadow-lg transition-all duration-200 hover:shadow-xl"
                disabled={isLoading}
              >
                <Check className="h-4 w-4" />
                Créer les Livraisons
              </Button>
            )}
            
            <Button 
              onClick={resetInterface}
              variant="secondary"
              className="flex items-center gap-2 bg-card hover:bg-accent text-foreground border-border shadow-md transition-all duration-200 hover:shadow-lg"
            >
              <RefreshCw className="h-4 w-4" />
              Reset
            </Button>
            
            <Button 
              onClick={synchroniserLivraisons}
              variant="outline"
              className="flex items-center gap-2 bg-card hover:bg-accent text-foreground border-border shadow-md transition-all duration-200 hover:shadow-lg"
              disabled={isLoading}
            >
              <RotateCcw className="h-4 w-4" />
              Synchroniser
            </Button>
            
            <Button 
              onClick={corrigerChargesLivreurs}
              disabled={isLoading}
              variant="outline"
              className="flex items-center gap-2 bg-red-500/10 border-red-500/20 text-red-600 hover:bg-red-500/20 shadow-md transition-all duration-200 hover:shadow-lg"
            >
              <RefreshCw className="h-4 w-4" />
              Corriger Charges
            </Button>
          </div>
        </div>
        </Card>

        {/* Interface manuelle */}
        {showManualInterface && currentData?.communes_data && (
          <Card className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden p-3 sm:p-6">
          <div className="space-y-4">
            <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2 text-foreground">
              <Users className="h-5 w-5 text-primary" />
              Attribution Manuelle par Commune
            </h2>
            
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Certaines communes nécessitent une attribution manuelle. Veuillez sélectionner un livreur pour chaque commune.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              {currentData.communes_data.map((commune: any, index: number) => {
                const communeNom = communesMapping[commune.commune] || commune.commune;
                return (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                    <h3 className="font-semibold">{communeNom}</h3>
                    <Badge variant="outline" className="text-xs w-fit">
                      {commune.bons_livraison?.length || 0} bon(s)
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Sélectionner un livreur
                      </label>
                      <select
                        className="w-full p-2 border rounded-md"
                        value={manualAssignments[commune.commune] || ''}
                        onChange={(e) => handleManualAssignment(commune.commune, e.target.value)}
                      >
                        <option value="">-- Choisir un livreur --</option>
                        {commune.livreurs_disponibles?.map((livreur: any) => (
                          <option 
                            key={livreur.name} 
                            value={livreur.name}
                            disabled={livreur.charge_actuelle >= livreur.capacite_max}
                          >
                            {livreur.nom_complet} - {livreur.vehicule} 
                            ({livreur.charge_actuelle}/{livreur.capacite_max})
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="text-sm text-muted-foreground">
                      <p className="font-medium mb-2">Bons de livraison:</p>
                      <ExpandableBonsList 
                        bons={commune.bons_livraison || []} 
                        maxDisplay={3} 
                        keyPrefix={`manual-bons-${commune.commune}`} 
                      />
                    </div>
                  </div>
                </div>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button 
                onClick={appliquerAssignationsManuelles}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg transition-all duration-200 hover:shadow-xl"
              >
                <Save className="h-4 w-4" />
                Appliquer Assignations
              </Button>
              
              <Button 
                onClick={annulerAssignationsManuelles}
                variant="secondary"
                className="flex items-center gap-2 bg-card hover:bg-accent text-foreground border-border shadow-md transition-all duration-200 hover:shadow-lg"
              >
                <X className="h-4 w-4" />
                Annuler
              </Button>
            </div>
          </div>
          </Card>
        )}

        {/* Résultats */}
        {showResults && currentData && (
          <Card className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden p-3 sm:p-6">
          <div className="space-y-4">
            <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2 text-foreground">
              <List className="h-5 w-5 text-primary" />
              {currentData.simulate ? 'Aperçu de la Répartition' : 'Résultats de la Répartition'}
            </h2>

            {/* Résumé */}
            <div className="bg-card/50 rounded-2xl border border-border shadow-2xl p-4 mb-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <MetaChip 
                  icon={List} 
                  label="Bons" 
                  value={currentData.total_bons_date || 0} 
                />
                <MetaChip 
                  icon={Package} 
                  label="Colis" 
                  value={Object.values(currentData.repartition || {}).reduce((total: number, rep: any) => total + (rep.total_colis || 0), 0)} 
                />
                <MetaChip 
                  icon={Users} 
                  label="Livreurs" 
                  value={Object.keys(currentData.repartition || {}).length} 
                />
              </div>
            </div>

            {/* Répartition détaillée */}
            {currentData.repartition && Object.keys(currentData.repartition).length > 0 && (
              <div className="space-y-4">
                <h3 className="text-base sm:text-lg font-semibold text-foreground">Répartition par Livreur</h3>
                
                <div className="space-y-3">
                  {Object.entries(currentData.repartition).map(([livreurNom, repartition]: [string, any]) => (
                    <Card key={livreurNom} className="p-4">
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-3">
                          <User className="h-5 w-5 text-primary" />
                          <div className="font-semibold text-foreground text-base sm:text-lg">{repartition.livreur}</div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                             <Badge variant="outline" className="text-xs">{repartition.total_colis} colis</Badge>
                             <Badge variant="outline" className="text-xs">{repartition.communes?.length || 0} commune(s)</Badge>
                             <Badge variant="outline" className="text-xs">{repartition.total_bons} bon(s)</Badge>
                             <Badge 
                               variant="outline" 
                               className={`${getChargeColor(repartition.taux_charge)} font-medium text-xs`}
                             >
                               {repartition.taux_charge}% charge
                             </Badge>
                           </div>
                         </div>
                       </div>
                       

                      
                      <div className="text-sm text-muted-foreground">
                        <HierarchicalDisplay 
                          repartition={repartition} 
                          keyPrefix={`hierarchical-${livreurNom}`}
                          communesMapping={communesMapping}
                        />
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Livraisons créées */}
            {currentData.livraisons_creees && currentData.livraisons_creees.length > 0 && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  {currentData.livraisons_creees.length} livraison(s) créée(s) avec succès !
                </AlertDescription>
              </Alert>
            )}
          </div>
          </Card>
        )}
      </div>



      {/* Modal d'alerte */}
      {showAlertModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl border border-border shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                alertType === 'success' ? 'bg-green-100 dark:bg-green-900/20' :
                alertType === 'error' ? 'bg-red-100 dark:bg-red-900/20' :
                alertType === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/20' :
                'bg-blue-100 dark:bg-blue-900/20'
              }`}>
                {alertType === 'success' && <Check className="w-5 h-5 text-green-600 dark:text-green-400" />}
                {alertType === 'error' && <X className="w-5 h-5 text-red-600 dark:text-red-400" />}
                {alertType === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />}
                {alertType === 'info' && <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {alertType === 'success' ? 'Succès' :
                   alertType === 'error' ? 'Erreur' :
                   alertType === 'warning' ? 'Attention' :
                   'Information'}
                </h3>
              </div>
            </div>
            
            <p className="text-foreground">
              {alertMessage}
            </p>
            
            <div className="flex justify-end pt-2">
              <Button 
                onClick={() => setShowAlertModal(false)}
                className={`flex items-center gap-2 shadow-lg transition-all duration-200 hover:shadow-xl ${
                  alertType === 'success' ? 'bg-green-600 hover:bg-green-700 text-white' :
                  alertType === 'error' ? 'bg-red-600 hover:bg-red-700 text-white' :
                  alertType === 'warning' ? 'bg-yellow-600 hover:bg-yellow-700 text-white' :
                  'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                OK
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GenerationLivraisons;