export interface DeliveryNote {
  name: string;
  status: string;
  custom_statut?: string;
  customer: string;
  customer_name?: string;
  posting_date: string;
  custom_date_de_livraison?: string;
  total_qty?: number;
  grand_total?: number;
  custom_nom_livreur?: string;
  custom_qr_image?: string;
  items?: Array<{
    name: string;
    item_code: string;
    item_name?: string;
    qty: number;
    custom_quantite_livree?: number;
    custom_statut_article?: string;
  }>;
}
