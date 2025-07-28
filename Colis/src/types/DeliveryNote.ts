export interface Colis {
  name: string;
  custom_numero_sequence?: string;
  status: string;
  client?: string;
  date?: string;
  bl: string;
  articles?: any[];
  articles_count?: number;
}

export interface DeliveryNote {
  name: string;
  status: string;
  customer: string;
  posting_date: string;
  lr_date?: string;
  total_qty?: number;
  custom_nom_livreur?: string;
  // Champs calculés côté client après récupération des colis
  colis?: Colis[];
  total_colis?: number;
  total_articles?: number;
}