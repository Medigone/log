// Enhanced delivery API types
export interface ArticleDeliveryUpdate {
  article_name: string;
  quantity_delivered?: number;
  status: 'delivered' | 'undeliverable' | 'deliver_all';
  reason?: string;
}

export interface DeliveryData {
  articles: ArticleDeliveryUpdate[];
}

export interface EvidenceData {
  photo_data?: string;
  photo_filename?: string;
  signature_data?: string;
  comments?: string;
  gps_location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    timestamp?: string;
  };
}

export interface EnhancedDeliveryUpdateResponse {
  success: boolean;
  message: string;
  results: Array<{
    article_name: string;
    success: boolean;
    message: string;
    updated_data?: {
      quantite_totale: number;
      quantite_livree: number;
      quantite_restante: number;
      statut_article: string;
    };
  }>;
  errors: string[];
  updated_colis_status: string;
  updated_colis_data: {
    status: string;
    articles: Array<{
      name: string;
      article: string;
      quantite_totale: number;
      quantite_livree: number;
      quantite_restante: number;
      statut_article: string;
    }>;
  };
}

export interface QuickAction {
  id: 'deliver_all' | 'partial_delivery' | 'client_absent' | 'access_refused';
  label: string;
  description: string;
  type: 'success' | 'warning' | 'error';
  icon: string;
}

export interface DeliverySummary {
  total_articles: number;
  delivered_articles: number;
  partial_articles: number;
  undelivered_articles: number;
  total_quantity: number;
  delivered_quantity: number;
  remaining_quantity: number;
  completion_percentage: number;
}

export interface StatusInfo {
  current_status: string;
  can_complete: boolean;
  requires_partial_status: boolean;
}

export interface SmartDeliveryActionsResponse {
  success: boolean;
  message?: string;
  quick_actions: QuickAction[];
  delivery_summary: DeliverySummary;
  status_info: StatusInfo;
}

export interface QuickActionResponse {
  success: boolean;
  message: string;
  new_status?: string;
}

// Article-level quantity tracking types
export interface ArticleQuantityUpdate {
  article_name: string;
  new_quantity: number;
  action: 'increase' | 'decrease' | 'set';
}

export interface QuantityTrackingResponse {
  success: boolean;
  message: string;
  updated_article?: {
    name: string;
    quantite_totale: number;
    quantite_livree: number;
    quantite_restante: number;
    statut_article: string;
  };
}