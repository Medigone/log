export interface LivraisonColis {
  name: string;
  colis?: string;
  sequence_number?: string;
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
  total_montant_a_encaisser?: number;
  total_paiements?: number;
  solde_restant?: number;
  creation?: string;
  modified?: string;
  owner?: string;
  bons_de_livraison?: LivraisonBonDeLivraison[];
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
  total_bls: number;
  total_montant: number;
  livraisons_par_statut: Record<string, number>;
}
