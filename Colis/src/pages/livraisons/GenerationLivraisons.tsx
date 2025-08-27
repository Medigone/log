import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/calendar';
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
  Clipboard,
  Map
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
    <div className={`inline-flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-3.5 bg-gradient-to-r from-card/80 to-card/60 border border-border/50 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 leading-none ${className}`}>
      <div className="p-1.5 bg-primary/10 rounded-lg">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <span className="inline-flex flex-col gap-0.5 text-foreground">
        <span className="text-muted-foreground font-medium text-xs uppercase tracking-wide">{label}</span>
        <span className="font-bold text-sm sm:text-base">{value}</span>
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
         {/* Affichage par commune */}
         {communes.map((commune, communeIndex) => {
           const communeNom = commune !== 'Non spécifiée' ? (communesMapping[commune] || commune) : 'Non spécifiée';
           const bonsDeCommune = repartition.bons_de_livraison?.filter((bon: any) => (bon.commune || 'Non spécifiée') === commune) || [];
           
           return (
             <div key={`${keyPrefix}-commune-${communeIndex}`} className="space-y-2">
               <div className="flex items-center gap-2">
                 <Badge 
                    variant="outline" 
                    className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 font-medium text-sm px-3 py-1.5 rounded-lg"
                  >
                    {communeNom}
                  </Badge>
               </div>
               <div className="ml-4 space-y-1">
                 {bonsDeCommune.map((bon: any, index: number) => (
                   <div key={`${keyPrefix}-bon-${index}`} className="p-2 bg-card/20 rounded border-l-2 border-primary/30 space-y-1">
                     <div className="flex flex-col">
                       <span className="text-sm font-mono text-muted-foreground">{bon.bon_de_livraison}</span>
                       {bon.customer && (
                         <span className="font-medium text-foreground">
                           {customersMapping[bon.customer] || bon.customer}
                         </span>
                       )}
                     </div>
                     <div className="flex flex-wrap items-center gap-2">
                       <Badge 
                         variant="outline" 
                         className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 font-medium text-xs px-2.5 py-1 rounded-lg"
                       >
                         {bon.total_colis || bon.custom_nombre_colis || 0} colis
                       </Badge>
                     </div>
                   </div>
                 ))}
               </div>
             </div>
           );
         })}
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
      // Corriger automatiquement les charges avant la génération
      try {
        const correctionResult = await callCorrigerCharges({});
        if (correctionResult?.message) {
          console.log('Charges corrigées automatiquement:', correctionResult.message.message);
        }
      } catch (correctionError) {
        console.warn('Erreur lors de la correction automatique des charges:', correctionError);
        // On continue même si la correction échoue
      }

      const result = await callRepartition({
        date_livraison: dateLivraison,
        mode: 'auto',
        simulate: modeSimulation,
        manual_assignments: Object.keys(manualAssignments).length > 0 ? manualAssignments : null
      });

      if (result?.message) {
        setCurrentData(result.message);
        setShowResults(true);
        
        if ((result.message.simulate && result.message.communes_data?.length > 0) || result.message.requires_manual_selection) {
          // Mode manuel nécessaire
          setShowManualInterface(true);
        }
      }
    } catch (error) {
      console.error('Erreur lors de la génération:', error);
      const errorMessage = error instanceof Error ? error.message : 
        (typeof error === 'object' && error !== null && 'message' in error) ? 
        String(error.message) : 
        'Erreur inconnue lors de la génération';
      showAlert(`Erreur lors de la génération: ${errorMessage}`, 'error');
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
      const errorMessage = error instanceof Error ? error.message : 
        (typeof error === 'object' && error !== null && 'message' in error) ? 
        String(error.message) : 
        'Erreur inconnue lors de la confirmation';
      showAlert(`Erreur lors de la confirmation: ${errorMessage}`, 'error');
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
      const errorMessage = error instanceof Error ? error.message : 
        (typeof error === 'object' && error !== null && 'message' in error) ? 
        String(error.message) : 
        'Erreur inconnue lors de la synchronisation';
      showAlert(`Erreur lors de la synchronisation: ${errorMessage}`, 'error');
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

  const appliquerAssignationsManuelles = async () => {
    // Validation des assignations
    const communesRequises = currentData?.communes_data || [];
    const assignationsManquantes = communesRequises.filter(
      commune => !manualAssignments[commune.commune]
    );
    
    if (assignationsManquantes.length > 0) {
      showAlert(
        `Veuillez assigner un livreur pour toutes les communes. ${assignationsManquantes.length} commune(s) non assignée(s).`,
        'warning'
      );
      return;
    }
    
    // Validation des capacités
     const erreurs = [];
     for (const commune of communesRequises) {
       const livreurId = manualAssignments[commune.commune];
       const livreur = commune.livreurs_disponibles?.find((l: any) => l.name === livreurId);
      
      if (livreur && (livreur.charge_actuelle + commune.nb_colis) > livreur.capacite_max) {
        erreurs.push(`${commune.commune}: Capacité insuffisante pour ${livreur.nom_complet}`);
      }
    }
    
    if (erreurs.length > 0) {
      showAlert(
        `Erreurs de capacité détectées:\n${erreurs.join('\n')}`,
        'error'
      );
      return;
    }
    
    setIsLoading(true);
    try {
      const result = await callRepartition({
        date_livraison: dateLivraison,
        mode: 'manuel',
        simulate: modeSimulation,
        manual_assignments: manualAssignments
      });
      
      if (result?.message) {
        setCurrentData(result.message);
        setShowManualInterface(false);
        showAlert('Assignations manuelles appliquées avec succès', 'success');
      }
    } catch (error) {
      console.error('Erreur lors de l\'application des assignations:', error);
      showAlert('Erreur lors de l\'application des assignations manuelles', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const annulerAssignationsManuelles = () => {
    setManualAssignments({});
    setShowManualInterface(false);
    showAlert('Assignations manuelles annulées', 'info');
  };

  const handleManualAssignment = (commune: string, livreurId: string) => {
    setManualAssignments(prev => ({
      ...prev,
      [commune]: livreurId
    }));
    
    // Validation en temps réel
     if (livreurId && currentData?.communes_data) {
       const communeData = currentData.communes_data.find((c: any) => c.commune === commune);
       const livreur = communeData?.livreurs_disponibles?.find((l: any) => l.name === livreurId);
      
      if (livreur && communeData) {
        const nouvelleCharge = livreur.charge_actuelle + communeData.nb_colis;
        if (nouvelleCharge > livreur.capacite_max) {
          showAlert(
            `Attention: ${livreur.nom_complet} dépassera sa capacité (${nouvelleCharge}/${livreur.capacite_max})`,
            'warning'
          );
        }
      }
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
      <div className="max-w-6xl mx-auto px-2 sm:px-4 pt-8 pb-8">

        {/* Paramètres de répartition */}
        <Card className="bg-card rounded-2xl border border-border shadow-lg p-4 sm:p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                  Paramètres de Répartition
                </h2>
                <p className="text-sm text-muted-foreground">
                  Configurez les paramètres pour la génération des livraisons
                </p>
              </div>
            </div>
          
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-3">
                <label htmlFor="date_livraison" className="text-sm font-medium text-foreground block">
                  Date de livraison
                </label>
                <DatePicker
                  value={dateLivraison}
                  onChange={(date) => setDateLivraison(date)}
                  className="w-full px-4 py-3 rounded-xl border-border focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="Sélectionner une date de livraison"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row flex-wrap gap-3 pt-2">
              <Button 
                onClick={genererRepartition} 
                disabled={isLoading}
                variant="default"
                size="default"
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:shadow-lg"
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
                  size="default"
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:shadow-lg bg-green-600 hover:bg-green-700 text-white"
                  disabled={isLoading}
                >
                  <Check className="h-4 w-4" />
                  Créer les Livraisons
                </Button>
              )}
              
              <Button 
                onClick={resetInterface}
                variant="secondary"
                size="default"
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:shadow-md"
              >
                <RefreshCw className="h-4 w-4" />
                Reset
              </Button>
              
              <Button 
                onClick={synchroniserLivraisons}
                variant="outline"
                size="default"
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:shadow-md border-border hover:border-primary/50"
                disabled={isLoading}
              >
                <RotateCcw className="h-4 w-4" />
                Synchroniser
              </Button>
            </div>
          </div>
        </Card>

        {/* Interface manuelle */}
        {showManualInterface && currentData?.communes_data && (
          <Card className="bg-card rounded-2xl border border-border shadow-lg overflow-hidden p-4 sm:p-6 mt-8">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                    Attribution Manuelle par Commune
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Sélectionnez un livreur pour chaque commune nécessitant une attribution manuelle
                  </p>
                </div>
              </div>
              
              <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  Certaines communes nécessitent une attribution manuelle. Veuillez sélectionner un livreur pour chaque commune.
                </AlertDescription>
              </Alert>

              <div className="space-y-6">
                {currentData.communes_data.map((commune: any, index: number) => {
                  const communeNom = communesMapping[commune.commune] || commune.commune;
                  return (
                    <Card key={index} className="border border-border/50 bg-card/30 p-4 sm:p-5">
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                              <Map className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-foreground text-base">{communeNom}</h3>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>{commune.nb_colis} colis à assigner</span>
                                {commune.bons_livraison && commune.bons_livraison.length > 0 && (
                                  <>
                                    <span>•</span>
                                    <span className="font-mono text-xs">{commune.bons_livraison[0].bon_de_livraison}</span>
                                    {commune.bons_livraison[0].customer && (
                                      <>
                                        <span>•</span>
                                        <span className="font-medium">
                                          {customersMapping[commune.bons_livraison[0].customer] || commune.bons_livraison[0].customer}
                                        </span>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                              {commune.bons_livraison?.length || 0} bon(s)
                            </Badge>
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                              {commune.nb_colis} colis
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <label className="text-sm font-medium text-foreground block">
                              Sélectionner un livreur
                            </label>
                            <div className="relative">
                              <select
                                className={`w-full px-4 py-3 bg-background border rounded-xl text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary appearance-none ${
                                  manualAssignments[commune.commune] 
                                    ? 'border-green-300 bg-green-50/50 dark:border-green-700 dark:bg-green-900/10' 
                                    : 'border-border hover:border-border/80'
                                }`}
                                value={manualAssignments[commune.commune] || ''}
                                onChange={(e) => handleManualAssignment(commune.commune, e.target.value)}
                              >
                                <option value="" className="text-muted-foreground">
                                  -- Choisir un livreur --
                                </option>
                                {commune.livreurs_disponibles?.map((livreur: any) => {
                                  const nouvelleCharge = livreur.charge_actuelle + commune.nb_colis;
                                  const depasseCapacite = nouvelleCharge > livreur.capacite_max;
                                  const tauxCharge = (livreur.charge_actuelle / livreur.capacite_max) * 100;
                                  
                                  return (
                                    <option 
                                      key={livreur.name} 
                                      value={livreur.name}
                                      disabled={livreur.charge_actuelle >= livreur.capacite_max}
                                      className={`py-2 ${
                                        depasseCapacite ? 'text-red-600' : 
                                        tauxCharge > 80 ? 'text-amber-600' : 
                                        'text-green-600'
                                      }`}
                                    >
                                      {livreur.nom_complet} - {livreur.vehicule} ({livreur.charge_actuelle}/{livreur.capacite_max})
                                      {depasseCapacite && ' ⚠️ Dépassement'}
                                      {!depasseCapacite && tauxCharge > 80 && ' ⚡ Presque plein'}
                                    </option>
                                  );
                                })}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            </div>
                            
                            {/* Indicateur de statut pour la commune */}
                            {manualAssignments[commune.commune] && (
                              <div className="mt-2 text-xs">
                                {(() => {
                                  const livreurSelectionne = commune.livreurs_disponibles?.find(
                                    (l: any) => l.name === manualAssignments[commune.commune]
                                  );
                                  if (!livreurSelectionne) return null;
                                  
                                  const nouvelleCharge = livreurSelectionne.charge_actuelle + commune.nb_colis;
                                  const depasseCapacite = nouvelleCharge > livreurSelectionne.capacite_max;
                                  
                                  if (depasseCapacite) {
                                    return (
                                      <div className="flex items-center gap-1 text-red-600">
                                        <AlertTriangle className="h-3 w-3" />
                                        <span>Capacité dépassée ({nouvelleCharge}/{livreurSelectionne.capacite_max})</span>
                                      </div>
                                    );
                                  } else {
                                    return (
                                      <div className="flex items-center gap-1 text-green-600">
                                        <Check className="h-3 w-3" />
                                        <span>Assignation valide ({nouvelleCharge}/{livreurSelectionne.capacite_max})</span>
                                      </div>
                                    );
                                  }
                                })()} 
                              </div>
                            )}
                          </div>
                          
                          
                        </div>
                      </div>
                    </Card>
                  );
              })}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-border/50">
              <Button 
                onClick={appliquerAssignationsManuelles}
                variant="default"
                size="default"
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:shadow-lg bg-green-600 hover:bg-green-700 text-white"
              >
                <Save className="h-4 w-4" />
                Appliquer Assignations
              </Button>
              
              <Button 
                onClick={annulerAssignationsManuelles}
                variant="secondary"
                size="default"
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:shadow-md"
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
          <Card className="bg-card rounded-2xl border border-border shadow-lg overflow-hidden p-4 sm:p-6 mt-8">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <List className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                    {currentData.simulate ? 'Aperçu de la Répartition' : 'Résultats de la Répartition'}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {currentData.simulate ? 'Prévisualisation des livraisons à créer' : 'Livraisons créées avec succès'}
                  </p>
                </div>
              </div>

              {/* Résumé */}
              <div className="bg-gradient-to-r from-card/60 to-card/40 rounded-2xl border border-border/50 shadow-sm p-5">
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetaChip 
                  icon={List} 
                  label="Bons" 
                  value={currentData.total_bons_date || 0} 
                />
                <MetaChip 
                  icon={Package} 
                  label="Articles" 
                  value={Object.values(currentData.repartition || {}).reduce((total: number, rep: any) => total + (rep.total_colis || 0), 0)} 
                />
                <MetaChip 
                  icon={Map} 
                  label="Communes" 
                  value={(() => {
                    const allCommunes = new Set();
                    Object.values(currentData.repartition || {}).forEach((rep: any) => {
                      rep.bons_de_livraison?.forEach((bon: any) => {
                        allCommunes.add(bon.commune || 'Non spécifiée');
                      });
                    });
                    return allCommunes.size;
                  })()} 
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
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-foreground">
                      Répartition par Livreur
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Détail des assignations par livreur
                    </p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {Object.entries(currentData.repartition).map(([livreurNom, repartition]: [string, any]) => (
                    <Card key={livreurNom} className="border border-border/50 bg-card/30 p-5 hover:shadow-md transition-all duration-200">
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-3">
                          <User className="h-5 w-5 text-primary" />
                          <div className="font-semibold text-foreground text-base sm:text-lg">{repartition.livreur}</div>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                             <Badge variant="outline" className="text-xs font-medium px-2.5 py-1 rounded-lg bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">{repartition.total_colis} colis</Badge>
                             <Badge variant="outline" className="text-xs font-medium px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">{repartition.communes?.length || 0} commune(s)</Badge>
                             <Badge variant="outline" className="text-xs font-medium px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">{repartition.total_bons} bon(s)</Badge>
                             <Badge 
                               variant="outline" 
                               className={`${getChargeColor(repartition.taux_charge)} font-medium text-xs px-2.5 py-1 rounded-lg`}
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