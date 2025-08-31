import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  // No props needed - using React Router
}

const GenerationLivraisons: React.FC<GenerationLivraisonsProps> = () => {
  const navigate = useNavigate();
  // LocalStorage key for persistence
  const STORAGE_KEY = 'deliveryGenerationState';
  
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
  
  const [dateLivraison, setDateLivraison] = useState<string>(
    savedState?.dateLivraison || new Date().toISOString().split('T')[0]
  );
  // Mode simulation forcé par défaut - plus de checkbox
  const modeSimulation = true;
  const [currentData, setCurrentData] = useState<LivraisonData | null>(savedState?.currentData || null);
  const [showResults, setShowResults] = useState<boolean>(savedState?.showResults || false);
  const [showManualInterface, setShowManualInterface] = useState<boolean>(savedState?.showManualInterface || false);
  const [manualAssignments, setManualAssignments] = useState<{[key: string]: string}>(savedState?.manualAssignments || {});
  const [expandedItems, setExpandedItems] = useState<{[key: string]: boolean}>({});
  
  // Nouveaux états pour l'attribution manuelle interactive
  const [interactiveAssignments, setInteractiveAssignments] = useState<{[key: string]: string}>(savedState?.interactiveAssignments || {});
  const [realTimeCharges, setRealTimeCharges] = useState<{[key: string]: {charge: number, capacite: number, nom: string}}>(savedState?.realTimeCharges || {});
  
  // État pour le mode d'édition de la prévisualisation
  const [isEditingPreview, setIsEditingPreview] = useState<boolean>(savedState?.isEditingPreview || false);
  const [previewAssignments, setPreviewAssignments] = useState<{[key: string]: string}>(savedState?.previewAssignments || {});
  
  // Function to save state to localStorage
  const saveStateToStorage = () => {
    try {
      const stateToSave = {
        timestamp: new Date().getTime(),
        dateLivraison,
        currentData,
        showResults,
        showManualInterface,
        manualAssignments,
        interactiveAssignments,
        realTimeCharges,
        isEditingPreview,
        previewAssignments
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
  
  // Effet pour maintenir la synchronisation entre les états
  useEffect(() => {
    // Nettoyer lors du démontage du composant
    return () => {
      // Nettoyage général si nécessaire
    };
  }, []);
  
  // Effect to automatically save state to localStorage when important state changes
  useEffect(() => {
    // Only save if we have some meaningful data (not initial empty state)
    if (currentData || showResults || Object.keys(interactiveAssignments).length > 0 || Object.keys(previewAssignments).length > 0) {
      saveStateToStorage();
    }
  }, [
    dateLivraison,
    currentData,
    showResults,
    showManualInterface,
    manualAssignments,
    interactiveAssignments,
    realTimeCharges,
    isEditingPreview,
    previewAssignments
  ]);
  
  // Effect to restore charges calculation on component mount with saved state
  useEffect(() => {
    if (savedState && currentData && (Object.keys(interactiveAssignments).length > 0 || Object.keys(previewAssignments).length > 0)) {
      // Recalculate real-time charges with the restored assignments
      const assignmentsToUse = Object.keys(previewAssignments).length > 0 ? previewAssignments : interactiveAssignments;
      if (Object.keys(assignmentsToUse).length > 0) {
        const newCharges = calculateRealTimeCharges(assignmentsToUse, currentData);
        setRealTimeCharges(newCharges);
      }
    }
  }, []); // Run only once on mount
  
  // Effet pour nettoyer lors du changement de date
  useEffect(() => {
    // Réinitialiser les états lors du changement de date
    setInteractiveAssignments({});
    setPreviewAssignments({}); // Ajouter la réinitialisation des preview assignments
    setIsEditingPreview(false);
  }, [dateLivraison]);
  
  // Effet pour synchroniser les charges en temps réel avec les assignations
  useEffect(() => {
    if (Object.keys(interactiveAssignments).length > 0 && currentData?.communes_data) {
      const newCharges = calculateRealTimeCharges(interactiveAssignments);
      setRealTimeCharges(newCharges);
    }
  }, [interactiveAssignments, currentData]);
  
  // Effet pour mettre à jour les charges lorsque currentData change (après régénération)
  useEffect(() => {
    if (currentData?.repartition && !isEditingPreview) {
      // Calculer les charges frontend même hors mode édition pour la cohérence
      // Extraire les assignations actuelles depuis la répartition
      const currentAssignments: {[key: string]: string} = {};
      Object.entries(currentData.repartition).forEach(([livreurNom, livreur]: [string, any]) => {
        if (livreur.bons_de_livraison) {
          livreur.bons_de_livraison.forEach((bon: any) => {
            const commune = bon.commune || bon.custom_commune;
            if (commune) {
              currentAssignments[commune] = livreur.livreur;
            }
          });
        }
      });
      
      // Calculer les charges avec les assignations actuelles
      if (Object.keys(currentAssignments).length > 0) {
        const newCharges = calculateRealTimeCharges(currentAssignments, currentData);
        setRealTimeCharges(newCharges);
      }
    }
  }, [currentData, isEditingPreview]);
  
  // Effet de debug pour suivre les changements de previewAssignments
  useEffect(() => {
    // Debug removed - functionality working correctly
  }, [previewAssignments]);
  
  // Effet de debug pour suivre le mode d'édition
  useEffect(() => {
    // Debug removed - functionality working correctly
  }, [isEditingPreview]);

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
  const HierarchicalDisplay = ({ repartition, keyPrefix, communesMapping, isEditing }: { repartition: any, keyPrefix: string, communesMapping: Record<string, string>, isEditing?: boolean }) => {
    // Extraire les communes uniques
     const communes = [...new Set(repartition.bons_de_livraison?.map((bon: any) => bon.commune || 'Non spécifiée') || [])] as string[];
     const communesNoms = communes.map((communeId: string) => communeId !== 'Non spécifiée' ? (communesMapping[communeId] || communeId) : communeId);
    
    // Récupérer la liste des livreurs disponibles pour l'édition
    const livreursDisponibles = currentData?.livreurs_disponibles;
    
    return (
       <div className="space-y-4">
         {/* Affichage par commune */}
         {communes.map((commune, communeIndex) => {
           const communeNom = commune !== 'Non spécifiée' ? (communesMapping[commune] || commune) : 'Non spécifiée';
           const bonsDeCommune = repartition.bons_de_livraison?.filter((bon: any) => (bon.commune || 'Non spécifiée') === commune) || [];
           
           return (
             <div key={`${keyPrefix}-commune-${communeIndex}`} className="space-y-2">
               <div className="flex flex-col gap-2">
                 <Badge 
                    variant="outline" 
                    className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 font-medium text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg w-fit"
                  >
                    {communeNom}
                  </Badge>
               </div>
               <div className="ml-2 sm:ml-4 space-y-1 sm:space-y-2">
                 {bonsDeCommune.map((bon: any, index: number) => (
                   <div key={`${keyPrefix}-bon-${index}`} className="p-2 sm:p-3 bg-card/20 rounded border-l-2 border-primary/30 space-y-2">
                     <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                       <div className="flex flex-col min-w-0 flex-1">
                         <span className="text-xs sm:text-sm font-mono text-muted-foreground break-all">{bon.bon_de_livraison}</span>
                         {bon.customer && (
                           <span className="font-medium text-foreground text-sm break-words">
                             {customersMapping[bon.customer] || bon.customer}
                           </span>
                         )}
                       </div>
                       {isEditing && livreursDisponibles && livreursDisponibles.length > 0 && (
                           <div className="w-full sm:w-auto sm:min-w-[200px]">
                             <select
                               value={(() => {
                                 const commune = bon.commune || bon.custom_commune;
                                 const currentValue = previewAssignments[commune] || '';
                                 return currentValue;
                               })()}
                               onChange={(e) => {
                                 const commune = bon.commune || bon.custom_commune;
                                 if (commune) {
                                   // Mettre à jour previewAssignments directement
                                   const newAssignments = { ...previewAssignments, [commune]: e.target.value };
                                   setPreviewAssignments(newAssignments);
                                 } else {
                                   // Fallback pour les assignations par bon individuel
                                   handleBonAssignmentChange(bon.bon_de_livraison, e.target.value, repartition.livreur);
                                 }
                               }}
                               className="w-full px-2 py-1 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 hover:border-primary/50 transition-colors"
                             >
                               <option value="">-- Changer de livreur --</option>
                             {livreursDisponibles.map((livreur: any) => {
                               // Calculer la charge actuelle pour cet affichage
                               const chargeActuelle = realTimeCharges[livreur.name]?.charge || livreur.charge_actuelle_date || 0;
                               const capaciteMax = livreur.capacite_max || 100;
                               const tauxCharge = Math.round((chargeActuelle / capaciteMax) * 100);
                               const depasseCapacite = tauxCharge > 100;
                               
                               return (
                                 <option key={livreur.name} value={livreur.name}>
                                   {livreur.nom_complet} - {livreur.vehicule} ({chargeActuelle}/{capaciteMax})
                                   {depasseCapacite ? ' ⚠️' : tauxCharge > 90 ? ' ⚡' : ''}
                                 </option>
                               );
                             })}
                           </select>
                         </div>
                         )}
                     </div>
                     <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                       <Badge 
                         variant="outline" 
                         className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 font-medium text-xs px-2 py-1 rounded-lg"
                       >
                         {bon.total_colis || bon.custom_nombre_colis || 0} colis
                       </Badge>
                       {isEditing && (
                         <Badge 
                           variant="outline" 
                           className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800 font-medium text-xs px-2 py-1 rounded-lg"
                         >
                           Modifiable
                         </Badge>
                       )}
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
      const result = await callRepartition({
        date_livraison: dateLivraison,
        mode: 'auto',
        simulate: modeSimulation
      });

      if (result?.message) {
        setCurrentData(result.message);
        setShowResults(true);
        
        // Si des communes nécessitent une attribution manuelle, activer le mode interactif
        if (result.message.communes_data && result.message.communes_data.length > 0) {
          setShowManualInterface(true);
          // Initialiser les assignations interactives avec les attributions automatiques existantes
          initializeInteractiveAssignments(result.message);
        }
      }
    } catch (error) {
      console.error('Erreur lors de la génération:', error);
      showAlert('Erreur lors de la génération de l\'aperçu', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour initialiser les assignations interactives
  const initializeInteractiveAssignments = (data: any) => {
    const initialAssignments: {[key: string]: string} = {};
    
    // Si il y a déjà des attributions automatiques, les utiliser comme point de départ
    if (data.repartition) {
      Object.entries(data.repartition).forEach(([livreurNom, rep]: [string, any]) => {
        if (rep.bons_de_livraison) {
          rep.bons_de_livraison.forEach((bon: any) => {
            if (bon.custom_commune) {
              // Trouver le livreur ID à partir du nom
              const livreur = data.livreurs_actifs?.find((l: any) => l.nom === livreurNom);
              if (livreur) {
                initialAssignments[bon.custom_commune] = livreur.name;
              }
            }
          });
        }
      });
    }
    
    setInteractiveAssignments(initialAssignments);
  };

  const confirmerRepartition = async () => {
    if (!currentData || !currentData.simulate) {
      showAlert('Aucune simulation à confirmer', 'warning');
      return;
    }

    setIsLoading(true);
    try {
      let assignmentsToUse = null;
      let mode = 'auto';
      
      // Vérifier d'abord les previewAssignments (modifications de l'aperçu)
      const hasPreviewAssignments = Object.keys(previewAssignments).length > 0 && 
                                   Object.values(previewAssignments).some(val => val !== '');
      
      // Puis vérifier les manualAssignments (assignations manuelles)
      const hasManualAssignments = Object.keys(manualAssignments).length > 0 && 
                                  Object.values(manualAssignments).some(val => val !== '');
      
      // Puis vérifier les interactiveAssignments (assignations interactives)
      const hasInteractiveAssignments = Object.keys(interactiveAssignments).length > 0 && 
                                       Object.values(interactiveAssignments).some(val => val !== '');
      
      if (hasPreviewAssignments) {
        // Extraire TOUTES les assignations actuelles, pas seulement les modifiées
        const completeAssignments: {[key: string]: string} = {};
        
        // D'abord, récupérer toutes les assignations existantes
        if (currentData.repartition) {
          Object.entries(currentData.repartition).forEach(([livreurNom, livreur]: [string, any]) => {
            if (livreur.bons_de_livraison) {
              livreur.bons_de_livraison.forEach((bon: any) => {
                const commune = bon.commune || bon.custom_commune;
                if (commune) {
                  // Trouver l'ID correct du livreur
                  let livreurId = livreur.livreur;
                  if (currentData.livreurs_disponibles) {
                    const foundLivreur = currentData.livreurs_disponibles.find((l: any) => 
                      l.nom_complet === livreurNom || l.name === livreur.livreur || l.nom_complet === livreur.livreur
                    );
                    if (foundLivreur) {
                      livreurId = foundLivreur.name;
                    }
                  }
                  completeAssignments[commune] = livreurId;
                }
              });
            }
          });
        }
        
        // Puis, appliquer les modifications
        Object.entries(previewAssignments).forEach(([commune, livreurId]) => {
          if (livreurId) {
            completeAssignments[commune] = livreurId;
          }
        });
        
        assignmentsToUse = completeAssignments;
        mode = 'manuel';
      } else if (hasManualAssignments) {
        assignmentsToUse = manualAssignments;
        mode = 'manuel';
      } else if (hasInteractiveAssignments) {
        assignmentsToUse = interactiveAssignments;
        mode = 'manuel';
      }
      
      const result = await callRepartition({
        date_livraison: dateLivraison,
        mode: mode,
        simulate: false,
        manual_assignments: assignmentsToUse
      });

      if (result?.message) {
        setCurrentData(result.message);
        const nbLivraisons = result.message.livraisons_creees?.length || 0;
        showAlert(`${nbLivraisons} livraisons créées avec succès`, 'success');
        
        // Clear localStorage since deliveries are now created (no longer in preview)
        clearSavedState();
        
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
    setPreviewAssignments({});
    setInteractiveAssignments({});
    setRealTimeCharges({});
    setIsEditingPreview(false);
    setDateLivraison(new Date().toISOString().split('T')[0]);
    // Clear localStorage when user explicitly resets
    clearSavedState();
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
      
      if (livreur && (livreur.charge_actuelle_date + commune.nb_colis) > livreur.capacite_max) {
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
        const nouvelleCharge = livreur.charge_actuelle_date + communeData.nb_colis;
        if (nouvelleCharge > livreur.capacite_max) {
          showAlert(
            `Attention: ${livreur.nom_complet} dépassera sa capacité (${nouvelleCharge}/${livreur.capacite_max})`,
            'warning'
          );
        }
      }
    }
  };

  // Nouvelle fonction pour la prévisualisation interactive en temps réel
  const generateInteractivePreview = async () => {
    if (!currentData?.communes_data) return;
    
    // Vérifier que toutes les communes sont assignées
    const communesRequises = currentData.communes_data;
    const assignationsManquantes = communesRequises.filter(
      commune => !interactiveAssignments[commune.commune]
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
      const livreurId = interactiveAssignments[commune.commune];
      const livreur = commune.livreurs_disponibles?.find((l: any) => l.name === livreurId);
      
      if (livreur && (livreur.charge_actuelle_date + commune.nb_colis) > livreur.capacite_max) {
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
    
    try {
      // Générer la prévisualisation avec les assignations manuelles
      const result = await callRepartition({
        date_livraison: dateLivraison,
        mode: 'manuel',
        simulate: true, // Toujours en mode simulation pour la prévisualisation
        manual_assignments: interactiveAssignments
      });
      
      if (result?.message) {
        setCurrentData(result.message);
        setShowResults(true);
      }
    } catch (error) {
      console.error('Erreur lors de la génération de la prévisualisation:', error);
      showAlert('Erreur lors de la génération de la prévisualisation', 'error');
    }
  };

  // Fonction pour calculer les charges en temps réel
  const calculateRealTimeCharges = (assignments: {[key: string]: string}, dataSource?: any) => {
    const charges: {[key: string]: {charge: number, capacite: number, nom: string}} = {};
    const sourceData = dataSource || currentData;
    
    // Initialiser avec les charges actuelles des livreurs
    sourceData?.communes_data?.forEach((commune: any) => {
      commune.livreurs_disponibles?.forEach((livreur: any) => {
        if (!charges[livreur.name]) {
          charges[livreur.name] = {
            charge: livreur.charge_actuelle_date,
            capacite: livreur.capacite_max,
            nom: livreur.nom_complet
          };
        }
      });
    });
    
    // Si on a les livreurs disponibles dans sourceData, les utiliser aussi
    sourceData?.livreurs_disponibles?.forEach((livreur: any) => {
      if (!charges[livreur.name]) {
        charges[livreur.name] = {
          charge: livreur.charge_actuelle_date || 0,
          capacite: livreur.capacite_max || 100,
          nom: livreur.nom_complet || livreur.name
        };
      }
    });
    
    // Ajouter les charges des assignations
    Object.entries(assignments).forEach(([commune, livreurId]) => {
      if (livreurId && charges[livreurId]) {
        const communeData = sourceData?.communes_data?.find((c: any) => c.commune === commune);
        if (communeData) {
          charges[livreurId].charge += communeData.nb_colis || 0;
        }
      }
    });
    
    return charges;
  };
  
  // Fonction pour valider les capacités en temps réel
  const validateCapacities = (assignments: {[key: string]: string}) => {
    const errors: {commune: string, livreur: string, message: string, severity: 'error' | 'warning'}[] = [];
    const warnings: {commune: string, livreur: string, message: string, severity: 'error' | 'warning'}[] = [];
    
    if (!currentData?.communes_data) return { errors, warnings, isValid: true };
    
    const charges = calculateRealTimeCharges(assignments);
    
    Object.entries(assignments).forEach(([commune, livreurId]) => {
      if (!livreurId) return;
      
      const communeData = currentData.communes_data?.find((c: any) => c.commune === commune);
      const livreur = communeData?.livreurs_disponibles?.find((l: any) => l.name === livreurId);
      const chargeData = charges[livreurId];
      
      if (livreur && chargeData && communeData) {
        const tauxCharge = (chargeData.charge / chargeData.capacite) * 100;
        
        if (tauxCharge > 100) {
          errors.push({
            commune,
            livreur: livreur.nom_complet,
            message: `Capacité dépassée: ${chargeData.charge}/${chargeData.capacite} colis (${Math.round(tauxCharge)}%)`,
            severity: 'error'
          });
        } else if (tauxCharge > 90) {
          warnings.push({
            commune,
            livreur: livreur.nom_complet,
            message: `Presque saturé: ${chargeData.charge}/${chargeData.capacite} colis (${Math.round(tauxCharge)}%)`,
            severity: 'warning'
          });
        }
      }
    });
    
    return {
      errors,
      warnings,
      isValid: errors.length === 0
    };
  };





  // Fonctions pour l'édition de la prévisualisation
  const initializePreviewAssignments = (data: any) => {
    if (!data?.repartition) return;
    
    // Initialiser directement avec les assignations actuelles
    const assignments: {[key: string]: string} = {};
    
    // Extraire les assignations actuelles pour chaque commune/bon
    Object.entries(data.repartition).forEach(([livreurNom, livreur]: [string, any]) => {
      if (livreur.bons_de_livraison) {
        livreur.bons_de_livraison.forEach((bon: any) => {
          const commune = bon.commune || bon.custom_commune;
          
          // Trouver le bon ID du livreur dans la liste des livreurs disponibles
          let livreurId = livreur.livreur;
          
          // Vérifier si on a la liste des livreurs disponibles pour faire le mapping
          if (data.livreurs_disponibles) {
            const foundLivreur = data.livreurs_disponibles.find((l: any) => 
              l.nom_complet === livreurNom || l.name === livreur.livreur || l.nom_complet === livreur.livreur
            );
            if (foundLivreur) {
              livreurId = foundLivreur.name;
            }
          }
          
          if (commune) {
            assignments[commune] = livreurId;
          }
        });
      }
    });
    
    setPreviewAssignments(assignments);
    // Synchroniser aussi avec les assignations interactives
    setInteractiveAssignments(assignments);
  };

  const handlePreviewAssignmentChange = (commune: string, livreurId: string) => {
    const newAssignments = { ...previewAssignments, [commune]: livreurId };
    setPreviewAssignments(newAssignments);
    
    // Synchroniser avec les assignations interactives
    const updatedInteractiveAssignments = { ...interactiveAssignments, [commune]: livreurId };
    setInteractiveAssignments(updatedInteractiveAssignments);
    
    // Recalculer les charges en temps réel
    const newCharges = calculateRealTimeCharges(updatedInteractiveAssignments);
    setRealTimeCharges(newCharges);
    
    // Affichage d'un feedback visuel pour l'utilisateur
    const communeData = currentData?.communes_data?.find((c: any) => c.commune === commune);
    const livreurData = currentData?.livreurs_disponibles?.find((l: any) => l.name === livreurId);
    
    if (livreurData && newCharges[livreurId]) {
      const charge = newCharges[livreurId];
      const tauxCharge = Math.round((charge.charge / charge.capacite) * 100);
      
      if (tauxCharge > 100) {
        showAlert(
          `Attention: ${charge.nom} dépassera sa capacité (${tauxCharge}%)`,
          'warning'
        );
      }
    }
  };

  const toggleEditMode = () => {
    if (!isEditingPreview && currentData) {
      // Initialiser directement sans nettoyer d'abord pour éviter les race conditions
      initializePreviewAssignments(currentData);
    } else if (isEditingPreview) {
      // Annuler les modifications - réinitialiser complètement les assignations
      setPreviewAssignments({});
      setInteractiveAssignments({});
    }
    setIsEditingPreview(!isEditingPreview);
  };

  const handleBonAssignmentChange = (bonId: string, newLivreurId: string, currentLivreurId: string) => {
    // Toujours travailler avec les données courantes directement
    const dataToUpdate = currentData;
    const setDataFunction = setCurrentData;
    
    if (!dataToUpdate) return;
    
    // Créer une copie profonde des données pour éviter les mutations
    const updatedData = JSON.parse(JSON.stringify(dataToUpdate));
    
    let bonToMove: any = null;
    let bonCommune: string = '';
    
    if (updatedData.repartition) {
      // Trouver et retirer le bon de l'ancien livreur
      Object.keys(updatedData.repartition).forEach(livreurNom => {
        const repartition = updatedData.repartition![livreurNom];
        if (repartition.livreur === currentLivreurId && repartition.bons_de_livraison) {
          const bonIndex = repartition.bons_de_livraison.findIndex(
            (bon: any) => bon.bon_de_livraison === bonId
          );
          
          if (bonIndex !== -1) {
            // Sauvegarder le bon avant de le retirer
            bonToMove = { ...repartition.bons_de_livraison[bonIndex] };
            bonCommune = bonToMove.commune || bonToMove.custom_commune || '';
            
            // Retirer le bon
            repartition.bons_de_livraison.splice(bonIndex, 1);
            
            // Recalculer les totaux pour l'ancien livreur
            repartition.total_bons = repartition.bons_de_livraison.length;
            repartition.total_colis = repartition.bons_de_livraison.reduce(
              (sum: number, bon: any) => sum + (bon.total_colis || bon.custom_nombre_colis || 0), 0
            );
            
            // Mettre à jour les communes assignées
            if (bonCommune) {
              repartition.communes = repartition.communes?.filter(
                (commune: string) => commune !== bonCommune
              ) || [];
            }
            
            // Recalculer le taux de charge
            const livreurData = updatedData.livreurs_disponibles?.find(
              (l: any) => l.name === currentLivreurId
            );
            if (livreurData) {
              repartition.taux_charge = Math.round(
                (repartition.total_colis / livreurData.capacite_max) * 100
              );
            }
          }
        }
      });
      
      // Ajouter le bon au nouveau livreur
      if (bonToMove) {
        let foundTargetLivreur = false;
        
        Object.keys(updatedData.repartition).forEach(livreurNom => {
          const repartition = updatedData.repartition![livreurNom];
          if (repartition.livreur === newLivreurId) {
            foundTargetLivreur = true;
            
            // Initialiser les arrays si nécessaire
            if (!repartition.bons_de_livraison) {
              repartition.bons_de_livraison = [];
            }
            if (!repartition.communes) {
              repartition.communes = [];
            }
            
            // Ajouter le bon
            repartition.bons_de_livraison.push(bonToMove);
            
            // Ajouter la commune si pas déjà présente
            if (bonCommune && !repartition.communes.includes(bonCommune)) {
              repartition.communes.push(bonCommune);
            }
            
            // Recalculer les totaux pour le nouveau livreur
            repartition.total_bons = repartition.bons_de_livraison.length;
            repartition.total_colis = repartition.bons_de_livraison.reduce(
              (sum: number, bon: any) => sum + (bon.total_colis || bon.custom_nombre_colis || 0), 0
            );
            
            // Recalculer le taux de charge
            const livreurData = updatedData.livreurs_disponibles?.find(
              (l: any) => l.name === newLivreurId
            );
            if (livreurData) {
              repartition.taux_charge = Math.round(
                (repartition.total_colis / livreurData.capacite_max) * 100
              );
            }
          }
        });
        
        // Si le nouveau livreur n'existe pas encore dans la répartition, le créer
        if (!foundTargetLivreur) {
          const livreurData = updatedData.livreurs_disponibles?.find(
            (l: any) => l.name === newLivreurId
          );
          
          if (livreurData) {
            const newLivreurKey = livreurData.nom_complet || newLivreurId;
            updatedData.repartition[newLivreurKey] = {
              livreur: newLivreurId,
              bons_de_livraison: [bonToMove],
              communes: bonCommune ? [bonCommune] : [],
              total_bons: 1,
              total_colis: bonToMove.total_colis || bonToMove.custom_nombre_colis || 0,
              taux_charge: Math.round(
                ((bonToMove.total_colis || bonToMove.custom_nombre_colis || 0) / livreurData.capacite_max) * 100
              )
            };
          }
        }
      }
    }
    
    // Mettre à jour les données appropriées
    setDataFunction(updatedData);
    
    // Mettre à jour les assignations interactives si nécessaire
    if (bonCommune) {
      const newAssignments = { ...interactiveAssignments };
      newAssignments[bonCommune] = newLivreurId;
      setInteractiveAssignments(newAssignments);
      
      // Recalculer les charges en temps réel
      const newCharges = calculateRealTimeCharges(newAssignments);
      setRealTimeCharges(newCharges);
    }
    
    // Afficher un message de confirmation
    showAlert(`Bon ${bonId} réassigné avec succès !`, 'success');
  };

  const savePreviewChanges = async () => {
    try {
      // Vérifier que toutes les communes ont été assignées
      if (!currentData || !Object.keys(previewAssignments).length) {
        showAlert('Aucune modification à sauvegarder', 'warning');
        return;
      }

      // Vérifier que tous les bons de livraison ont des assignations valides (non vides)
      const assignationsVides = Object.entries(previewAssignments).filter(([commune, livreurId]) => !livreurId || livreurId.trim() === '');
      if (assignationsVides.length > 0) {
        // Compter le nombre de bons de livraison non assignés
        let totalBonsNonAssignes = 0;
        if (currentData?.repartition) {
          Object.values(currentData.repartition).forEach((repartition: any) => {
            if (repartition.bons_de_livraison) {
              repartition.bons_de_livraison.forEach((bon: any) => {
                const commune = bon.commune || bon.custom_commune;
                if (commune && assignationsVides.some(([c]) => c === commune)) {
                  totalBonsNonAssignes++;
                }
              });
            }
          });
        }
        
        showAlert(
          `Veuillez sélectionner un livreur pour tous les bons de livraison. ${totalBonsNonAssignes} bon(s) de livraison non assigné(s).`,
          'warning'
        );
        return;
      }
      

      // Appeler l'API backend pour régénérer les livraisons avec les assignations manuelles
      const result = await callRepartition({
        date_livraison: dateLivraison,
        mode: 'manuel',
        simulate: modeSimulation, // Respecter le mode simulation
        manual_assignments: previewAssignments
      });
      
      if (result?.message) {
        // Mettre à jour les données courantes avec les nouvelles données générées
        setCurrentData(result.message);
        
        // Synchroniser les assignations interactives
        setInteractiveAssignments(previewAssignments);
        
        // Recalculer les charges côté frontend comme le fait 'Générer Aperçu'
        // Utiliser la même logique que genererRepartition()
        setTimeout(() => {
          // Réinitialiser et recalculer les charges avec les nouvelles assignations
          const newCharges = calculateRealTimeCharges(previewAssignments, result.message);
          setRealTimeCharges(newCharges);
          
          // Si il y a des communes qui nécessitent une attribution manuelle, réactiver le mode interactif
          if (result.message.communes_data && result.message.communes_data.length > 0) {
            setShowManualInterface(true);
            // Réinitialiser les assignations interactives avec les nouvelles attributions
            const newInteractiveAssignments = { ...previewAssignments };
            setInteractiveAssignments(newInteractiveAssignments);
            
            // Recalculer les charges avec les assignations interactives
            const updatedCharges = calculateRealTimeCharges(newInteractiveAssignments, result.message);
            setRealTimeCharges(updatedCharges);
          }
        }, 100);
        
        // Fermer le mode édition
        setIsEditingPreview(false);
        setPreviewAssignments({});
        
        showAlert('Livraisons modifiées générées avec succès !', 'success');
      }
      
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des modifications:', error);
      showAlert('Erreur lors de la génération des livraisons modifiées', 'error');
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

              <Dot className="w-4 h-4" />
              <span>Génération de livraisons</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {(currentData || showResults) && (
                <div className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 border border-green-200 rounded-lg text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400">
                  <Clipboard className="h-3 w-3" />
                  <span className="text-xs font-medium">Sauvegardé</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-2 sm:px-4 pt-6 sm:pt-8 pb-6 sm:pb-8">

        {/* Paramètres de répartition */}
        <Card className="bg-card rounded-2xl border border-border shadow-lg p-3 sm:p-4 lg:p-6">
          <div className="space-y-6">
            {/* <div className="flex items-center gap-3">
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
            </div> */}
          
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              <div className="space-y-3">
                <label htmlFor="date_livraison" className="text-sm font-medium text-foreground block">
                  Date de livraison
                </label>
                <DatePicker
                  value={dateLivraison}
                  onChange={(date) => setDateLivraison(date)}
                  className="w-fit"
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
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:shadow-lg w-full sm:w-auto"
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {isLoading ? 'Génération en cours...' : 'Générer Aperçu'}
              </Button>
              

              
              <Button 
                onClick={resetInterface}
                variant="secondary"
                size="default"
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:shadow-md w-full sm:w-auto"
              >
                <RefreshCw className="h-4 w-4" />
                Reset
              </Button>
              
              <Button 
                onClick={synchroniserLivraisons}
                variant="outline"
                size="default"
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:shadow-md border-border hover:border-primary/50 w-full sm:w-auto"
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
          <Card className="bg-card rounded-2xl border border-border shadow-lg overflow-hidden p-3 sm:p-4 lg:p-6 mt-6 sm:mt-8">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                    Attribution Manuelle Interactive
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Sélectionnez un livreur pour chaque commune et prévisualisez la répartition en temps réel
                  </p>
                </div>
              </div>
              
              <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  Certaines communes nécessitent une attribution manuelle. Sélectionnez un livreur pour chaque commune et prévisualisez le résultat.
                </AlertDescription>
              </Alert>

              {/* Résumé des charges en temps réel */}
              {Object.keys(interactiveAssignments).length > 0 && Object.keys(realTimeCharges).length > 0 && (
                <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 p-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-600" />
                      <h4 className="font-medium text-blue-900 dark:text-blue-100">Résumé des Charges en Temps Réel</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(realTimeCharges)
                        .filter(([livreurId]) => Object.values(interactiveAssignments).includes(livreurId))
                        .map(([livreurId, data]) => {
                          const tauxCharge = (data.charge / data.capacite) * 100;
                          const couleur = tauxCharge > 100 ? 'red' : tauxCharge > 90 ? 'amber' : 'green';
                          
                          return (
                            <div key={livreurId} className={`p-3 rounded-lg border transition-all duration-300 ${
                              couleur === 'red' ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800' :
                              couleur === 'amber' ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800' :
                              'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
                            }`}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium">{data.nom}</span>
                                <Badge variant="outline" className={`text-xs transition-colors duration-300 ${
                                  couleur === 'red' ? 'text-red-700 border-red-300' :
                                  couleur === 'amber' ? 'text-amber-700 border-amber-300' :
                                  'text-green-700 border-green-300'
                                }`}>
                                  {Math.round(tauxCharge)}%
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {data.charge}/{data.capacite} colis
                              </div>
                              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2">
                                <div 
                                  className={`h-1.5 rounded-full transition-all duration-500 ${
                                    couleur === 'red' ? 'bg-red-500' :
                                    couleur === 'amber' ? 'bg-amber-500' :
                                    'bg-green-500'
                                  }`}
                                  style={{ width: `${Math.min(tauxCharge, 100)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })} 
                    </div>
                  </div>
                </Card>
              )}

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
                                  interactiveAssignments[commune.commune] 
                                    ? 'border-green-300 bg-green-50/50 dark:border-green-700 dark:bg-green-900/10' 
                                    : 'border-border hover:border-border/80'
                                }`}
                                value={interactiveAssignments[commune.commune] || ''}
                                onChange={(e) => {
                                  const newAssignments = { ...interactiveAssignments, [commune.commune]: e.target.value };
                                  setInteractiveAssignments(newAssignments);
                                  const newCharges = calculateRealTimeCharges(newAssignments);
                                  setRealTimeCharges(newCharges);
                                }}
                              >
                                <option value="" className="text-muted-foreground">
                                  -- Choisir un livreur --
                                </option>
                                {commune.livreurs_disponibles?.map((livreur: any) => {
                                  const chargeRealTime = realTimeCharges[livreur.name]?.charge || livreur.charge_actuelle_date;
                                  const nouvelleCharge = chargeRealTime + commune.nb_colis;
                                  const depasseCapacite = nouvelleCharge > livreur.capacite_max;
                                  const tauxCharge = (chargeRealTime / livreur.capacite_max) * 100;
                                  
                                  return (
                                    <option 
                                      key={livreur.name} 
                                      value={livreur.name}
                                      disabled={chargeRealTime >= livreur.capacite_max}
                                      className={`py-2 ${
                                        depasseCapacite ? 'text-red-600' : 
                                        tauxCharge > 80 ? 'text-amber-600' : 
                                        'text-green-600'
                                      }`}
                                    >
                                      {livreur.nom_complet} - {livreur.vehicule} ({chargeRealTime}/{livreur.capacite_max})
                                      {depasseCapacite && ' ⚠️ Dépassement'}
                                      {!depasseCapacite && tauxCharge > 80 && ' ⚡ Presque plein'}
                                    </option>
                                  );
                                })}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            </div>
                            
                            {/* Indicateur de statut pour la commune avec validation temps réel */}
                            {interactiveAssignments[commune.commune] && (
                              <div className="mt-2 text-xs">
                                {(() => {
                                  const livreurSelectionne = commune.livreurs_disponibles?.find(
                                    (l: any) => l.name === interactiveAssignments[commune.commune]
                                  );
                                  if (!livreurSelectionne) return null;
                                  
                                  // Utiliser les données de charges en temps réel
                                  const chargeRealTime = realTimeCharges[livreurSelectionne.name]?.charge || livreurSelectionne.charge_actuelle_date;
                                  const nouvelleCharge = chargeRealTime;
                                  const depasseCapacite = nouvelleCharge > livreurSelectionne.capacite_max;
                                  const tauxCharge = (nouvelleCharge / livreurSelectionne.capacite_max) * 100;
                                  
                                  if (depasseCapacite) {
                                    return (
                                      <div className="flex items-center gap-1 text-red-600 animate-pulse">
                                        <AlertTriangle className="h-3 w-3" />
                                        <span>Capacité dépassée ({nouvelleCharge}/{livreurSelectionne.capacite_max}) - {Math.round(tauxCharge)}%</span>
                                      </div>
                                    );
                                  } else if (tauxCharge > 90) {
                                    return (
                                      <div className="flex items-center gap-1 text-amber-600">
                                        <AlertTriangle className="h-3 w-3" />
                                        <span>Presque saturé ({nouvelleCharge}/{livreurSelectionne.capacite_max}) - {Math.round(tauxCharge)}%</span>
                                      </div>
                                    );
                                  } else {
                                    return (
                                      <div className="flex items-center gap-1 text-green-600">
                                        <Check className="h-3 w-3" />
                                        <span>Assignation valide ({nouvelleCharge}/{livreurSelectionne.capacite_max}) - {Math.round(tauxCharge)}%</span>
                                      </div>
                                    );
                                  }
                                })()} 
                              </div>
                            )}
                            
                            {/* Indicateur de progression global */}
                            {currentData?.communes_data && (
                              <div className="mt-3 text-xs text-muted-foreground">
                                {(() => {
                                  const totalCommunes = currentData.communes_data.length;
                                  const communesAssignees = Object.keys(interactiveAssignments).filter(k => interactiveAssignments[k]).length;
                                  const pourcentage = Math.round((communesAssignees / totalCommunes) * 100);
                                  
                                  return (
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 bg-muted rounded-full h-2">
                                        <div 
                                          className={`h-2 rounded-full transition-all duration-300 ${
                                            pourcentage === 100 ? 'bg-green-500' : 'bg-blue-500'
                                          }`}
                                          style={{ width: `${pourcentage}%` }}
                                        />
                                      </div>
                                      <span className="text-xs font-medium">
                                        {communesAssignees}/{totalCommunes} communes assignées
                                      </span>
                                    </div>
                                  );
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
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-border/50">
              {(() => {
                const totalCommunes = currentData?.communes_data?.length || 0;
                const communesAssignees = Object.keys(interactiveAssignments).filter(k => interactiveAssignments[k]).length;
                const toutesAssignees = communesAssignees === totalCommunes && totalCommunes > 0;
                
                return (
                  <>
                    <Button 
                      onClick={generateInteractivePreview}
                      variant="default"
                      size="default"
                      className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:shadow-lg ${
                        toutesAssignees 
                          ? 'bg-green-600 hover:bg-green-700 text-white' 
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                      disabled={communesAssignees === 0}
                    >
                      {toutesAssignees ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      {toutesAssignees 
                        ? 'Prévisualisation Complète' 
                        : `Prévisualiser (${communesAssignees}/${totalCommunes})`
                      }
                    </Button>
                    
                    <Button 
                      onClick={() => {
                        showAlert('Fonction de prévisualisation désactivée', 'info');
                      }}
                      variant="outline"
                      size="default"
                      className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:shadow-md"
                      disabled
                    >
                      <RefreshCw className="h-4 w-4" />
                      Prévisualisation Simplifiée
                    </Button>
                  </>
                );
              })()}
              
              <Button 
                onClick={() => setShowManualInterface(false)}
                variant="secondary"
                size="default"
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all hover:shadow-md"
              >
                <X className="h-4 w-4" />
                Fermer
              </Button>
            </div>
          </Card>
        )}



        {/* Résultats */}
        {showResults && currentData && (
          <Card className="bg-card rounded-2xl border border-border shadow-lg overflow-hidden p-3 sm:p-4 lg:p-6 mt-6 sm:mt-8">
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <List className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                      {currentData.simulate ? 'Aperçu de la Répartition' : 'Résultats de la Répartition'}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {currentData.simulate ? (isEditingPreview ? 'Mode édition - Modifiez les attributions' : 'Prévisualisation des livraisons à créer') : 'Livraisons créées avec succès'}
                    </p>
                  </div>
                </div>
                
                {/* Boutons d'action pour les résultats en mode simulation */}
                {currentData.simulate && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    {/* Bouton Créer les Livraisons - affiché seulement si pas en mode édition */}
                    {!isEditingPreview && (
                      <Button 
                        onClick={confirmerRepartition}
                        variant="default"
                        size="sm"
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all hover:shadow-lg bg-green-600 hover:bg-green-700 text-white order-1 sm:order-1"
                        disabled={isLoading}
                      >
                        <Check className="h-4 w-4" />
                        Créer les Livraisons
                      </Button>
                    )}
                    
                    {/* Boutons d'édition */}
                    {isEditingPreview ? (
                      <>
                        <Button
                          onClick={savePreviewChanges}
                          variant="default"
                          size="sm"
                          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all hover:shadow-md order-2 sm:order-2"
                        >
                          <Save className="h-4 w-4" />
                          Régénérer
                        </Button>
                        <Button
                          onClick={toggleEditMode}
                          variant="outline"
                          size="sm"
                          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all hover:shadow-md order-3 sm:order-3"
                        >
                          <X className="h-4 w-4" />
                          Annuler
                        </Button>
                      </>
                    ) : (
                      <Button
                        onClick={toggleEditMode}
                        variant="outline"
                        size="sm"
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all hover:shadow-md order-2 sm:order-2"
                      >
                        <Edit className="h-4 w-4" />
                        Modifier
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Résumé */}
              <div className="bg-gradient-to-r from-card/60 to-card/40 rounded-2xl border border-border/50 shadow-sm p-4 sm:p-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
                    <Card key={livreurNom} className="border border-border/50 bg-card/30 p-4 sm:p-5 hover:shadow-md transition-all duration-200">
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-3">
                          <User className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                          <div className="font-semibold text-foreground text-sm sm:text-base lg:text-lg break-words">{repartition.livreur}</div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                             <Badge variant="outline" className="text-xs font-medium px-2 py-1 rounded-lg bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">{repartition.total_colis} colis</Badge>
                             <Badge variant="outline" className="text-xs font-medium px-2 py-1 rounded-lg bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">{repartition.communes?.length || 0} commune(s)</Badge>
                             <Badge variant="outline" className="text-xs font-medium px-2 py-1 rounded-lg bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800">{repartition.total_bons} bon(s)</Badge>
                             <Badge 
                               variant="outline" 
                               className={`${(() => {
                                 // Toujours utiliser les calculs frontend pour la cohérence
                                 let chargePercentage = repartition.taux_charge; // Fallback sur backend
                                 
                                 // Essayer d'utiliser les calculs frontend en priorité
                                 if (realTimeCharges[repartition.livreur]) {
                                   const charge = realTimeCharges[repartition.livreur];
                                   chargePercentage = Math.round((charge.charge / charge.capacite) * 100);
                                 } else if (currentData?.livreurs_disponibles) {
                                   // Calculer dynamiquement si pas de charge en temps réel
                                   const livreur = currentData.livreurs_disponibles.find((l: any) => 
                                     l.name === repartition.livreur || l.nom_complet === repartition.livreur
                                   );
                                   if (livreur) {
                                     chargePercentage = Math.round((repartition.total_colis / livreur.capacite_max) * 100);
                                   }
                                 }
                                 
                                 return getChargeColor(chargePercentage);
                               })()} font-medium text-xs px-2 py-1 rounded-lg`}
                             >
                               {(() => {
                                 // Même logique pour l'affichage du pourcentage
                                 let chargePercentage = repartition.taux_charge;
                                 
                                 if (realTimeCharges[repartition.livreur]) {
                                   const charge = realTimeCharges[repartition.livreur];
                                   chargePercentage = Math.round((charge.charge / charge.capacite) * 100);
                                 } else if (currentData?.livreurs_disponibles) {
                                   const livreur = currentData.livreurs_disponibles.find((l: any) => 
                                     l.name === repartition.livreur || l.nom_complet === repartition.livreur
                                   );
                                   if (livreur) {
                                     chargePercentage = Math.round((repartition.total_colis / livreur.capacite_max) * 100);
                                   }
                                 }
                                 
                                 return chargePercentage;
                               })()}% charge
                             </Badge>
                           </div>
                         </div>
                       </div>
                       

                      
                      <div className="text-xs sm:text-sm text-muted-foreground mt-3">
                        <HierarchicalDisplay 
                          repartition={repartition} 
                          keyPrefix={`hierarchical-${livreurNom}`}
                          communesMapping={communesMapping}
                          isEditing={isEditingPreview}
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