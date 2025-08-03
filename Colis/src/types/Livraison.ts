export interface LivraisonColis {
  name: string;
  colis: string;
  numero_sequence?: string;
  client?: string;
  bon_de_livraison?: string;
  status: string;
}

export interface LivraisonBonDeLivraison {
  name: string;
  bon_de_livraison: string;
  customer?: string;
  custom_date_de_livraison?: string;
  custom_commune?: string;
  custom_wilaya?: string;
  custom_nom_livreur?: string;
  custom_vehicule?: string;
  custom_nombre_colis?: number;
  grand_total?: number;
  total_qty?: number;
  status?: string;
  type?: string;
}

export interface Livraison {
  name: string;
  date_liv: string;
  status: string;
  livreur?: string;
  nom_livreur?: string;
  vehicule?: string;
  total_colis?: number;
  total_montant_a_encaisser?: number;
  total_paiements?: number;
  solde_restant?: number;
  creation?: string;
  modified?: string;
  owner?: string;
  
  // Tables enfants
  colis?: LivraisonColis[];
  bons_de_livraison?: LivraisonBonDeLivraison[];
  
  // Champs calculés côté client
  communes?: string[];
  clients?: string[];
  statut_global?: string;
}

export interface LivraisonFilters {
  date_from?: string;
  date_to?: string;
  status?: string;
  livreur?: string;
  vehicule?: string;
  commune?: string;
}

export interface LivraisonStats {
  total_livraisons: number;
  total_colis: number;
  total_montant: number;
  livraisons_par_statut: Record<string, number>;
}