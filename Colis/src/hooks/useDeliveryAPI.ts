import { useFrappePostCall } from 'frappe-react-sdk';
import type {
  DeliveryData,
  EvidenceData,
  EnhancedDeliveryUpdateResponse,
  SmartDeliveryActionsResponse,
  QuickActionResponse,
  QuantityTrackingResponse
} from '@/types/delivery';

/**
 * Hook for the enhanced delivery update API
 * Supports bulk article updates with evidence collection
 */
export function useEnhancedDeliveryUpdate() {
  const { call, loading, error, reset } = useFrappePostCall<EnhancedDeliveryUpdateResponse>(
    'log.delivery_note_ops.enhanced_delivery_update'
  );

  const updateDelivery = async (
    colisId: string,
    deliveryData: DeliveryData,
    evidenceData?: EvidenceData
  ) => {
    return await call({
      colis_id: colisId,
      delivery_data: deliveryData,
      evidence_data: evidenceData || null
    });
  };

  return {
    updateDelivery,
    loading,
    error,
    reset
  };
}

/**
 * Hook for getting smart delivery actions
 * Returns quick actions and delivery summary
 */
export function useSmartDeliveryActions() {
  const { call, loading, error, reset } = useFrappePostCall<SmartDeliveryActionsResponse>(
    'log.delivery_note_ops.get_smart_delivery_actions'
  );

  const getActions = async (colisId: string) => {
    return await call({ colis_id: colisId });
  };

  return {
    getActions,
    loading,
    error,
    reset
  };
}

/**
 * Hook for executing quick delivery actions
 * Handles predefined workflows like "deliver all", "client absent", etc.
 */
export function useQuickAction() {
  const { call, loading, error, reset } = useFrappePostCall<QuickActionResponse>(
    'log.delivery_note_ops.execute_quick_action'
  );

  const executeAction = async (
    colisId: string,
    actionId: string,
    reason?: string
  ) => {
    return await call({
      colis_id: colisId,
      action_id: actionId,
      reason: reason || null
    });
  };

  return {
    executeAction,
    loading,
    error,
    reset
  };
}

/**
 * Hook for article-level quantity tracking
 * Manages individual article delivery quantities
 */
export function useArticleQuantityTracking() {
  const { call: deliverQuantity, loading: deliverLoading } = useFrappePostCall<QuantityTrackingResponse>(
    'log.delivery_note_ops.deliver_article_quantity'
  );

  const { call: deliverRemaining, loading: remainingLoading } = useFrappePostCall<QuantityTrackingResponse>(
    'log.delivery_note_ops.deliver_article_remaining'
  );

  const { call: markUndeliverable, loading: undeliverableLoading } = useFrappePostCall<QuantityTrackingResponse>(
    'log.delivery_note_ops.mark_article_undeliverable'
  );

  const updateArticleQuantity = async (
    colisId: string,
    articleName: string,
    quantity: number
  ) => {
    return await deliverQuantity({
      docname: colisId,
      article_name: articleName,
      quantity: quantity,
      confirm: true
    });
  };

  const deliverRemainingQuantity = async (
    colisId: string,
    articleName: string
  ) => {
    return await deliverRemaining({
      docname: colisId,
      article_name: articleName,
      confirm: true
    });
  };

  const markAsUndeliverable = async (
    colisId: string,
    articleName: string,
    reason: string = ''
  ) => {
    return await markUndeliverable({
      docname: colisId,
      article_name: articleName,
      reason: reason,
      confirm: true
    });
  };

  return {
    updateArticleQuantity,
    deliverRemainingQuantity,
    markAsUndeliverable,
    loading: deliverLoading || remainingLoading || undeliverableLoading
  };
}

/**
 * Utility functions for delivery data manipulation
 */
export const DeliveryUtils = {
  /**
   * Create delivery data for delivering all remaining articles
   */
  createDeliverAllData: (articles: Array<{ name: string; quantite_restante: number }>): DeliveryData => ({
    articles: articles
      .filter(article => article.quantite_restante > 0)
      .map(article => ({
        article_name: article.name,
        status: 'deliver_all' as const
      }))
  }),

  /**
   * Create delivery data for partial delivery
   */
  createPartialDeliveryData: (
    articleUpdates: Array<{ name: string; quantity: number }>
  ): DeliveryData => ({
    articles: articleUpdates.map(update => ({
      article_name: update.name,
      quantity_delivered: update.quantity,
      status: 'delivered' as const
    }))
  }),

  /**
   * Create delivery data for marking articles as undeliverable
   */
  createUndeliverableData: (
    articles: Array<{ name: string }>,
    reason: string
  ): DeliveryData => ({
    articles: articles.map(article => ({
      article_name: article.name,
      status: 'undeliverable' as const,
      reason: reason
    }))
  }),

  /**
   * Calculate completion percentage
   */
  calculateCompletion: (delivered: number, total: number): number => {
    if (total === 0) return 0;
    return Math.round((delivered / total) * 100);
  },

  /**
   * Check if delivery can be completed
   */
  canCompleteDelivery: (articles: Array<{ quantite_restante: number }>): boolean => {
    return articles.every(article => article.quantite_restante === 0);
  },

  /**
   * Get delivery status based on articles
   */
  getDeliveryStatus: (articles: Array<{ statut_article: string }>): string => {
    if (articles.length === 0) return 'Nouveau';
    
    const statuses = articles.map(a => a.statut_article);
    
    if (statuses.every(s => s === 'Livré')) return 'Livré';
    if (statuses.every(s => s === 'En attente')) return 'Nouveau';
    if (statuses.every(s => s === 'Non livré')) return 'Non Livré';
    if (statuses.some(s => s === 'Livré') || statuses.some(s => s === 'Partiellement livré')) {
      return 'Partiellement Livré';
    }
    
    return 'En cours';
  }
};