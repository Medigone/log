import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, MapPin, User } from "lucide-react";
import type { RecentDelivery } from "../hooks/useDashboardData";

/* =========================
   Types
   ========================= */
interface RecentDeliveriesProps {
  data: RecentDelivery[];
  isLoading: boolean;
}

/* =========================
   Helper Functions
   ========================= */
function getStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case 'livre':
    case 'livré':
    case 'delivered':
      return "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400";
    case 'en_cours':
    case 'en cours':
    case 'in_progress':
      return "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400";
    case 'nouveau':
    case 'new':
      return "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400";
    case 'annule':
    case 'annulé':
    case 'cancelled':
      return "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
    default:
      return "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
  }
}

function formatDate(dateStr: string) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
}

function getStatusLabel(status: string) {
  switch (status.toLowerCase()) {
    case 'livre':
    case 'livré':
    case 'delivered':
      return "Livré";
    case 'en_cours':
    case 'en cours':
    case 'in_progress':
      return "En cours";
    case 'nouveau':
    case 'new':
      return "Nouveau";
    case 'annule':
    case 'annulé':
    case 'cancelled':
      return "Annulé";
    default:
      return status;
  }
}

/* =========================
   Component
   ========================= */
export function RecentDeliveries({ data, isLoading }: RecentDeliveriesProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Livraisons Récentes</CardTitle>
          <p className="text-sm text-muted-foreground">
            Dernières activités de livraison
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-md border">
                <div className="w-8 h-6 bg-muted animate-pulse rounded" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
                  <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
                  <div className="h-3 bg-muted animate-pulse rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Livraisons Récentes</CardTitle>
          <p className="text-sm text-muted-foreground">
            Dernières activités de livraison
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Aucune livraison récente
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activité Récente</CardTitle>
        <p className="text-sm text-muted-foreground">
          Vous avez {data.length} livraison{data.length > 1 ? 's' : ''} récente{data.length > 1 ? 's' : ''}
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          {data.map((delivery, index) => (
            <div key={delivery.name || index} className="flex items-center">
              <div className="space-y-1">
                <p className="text-sm font-medium leading-none">
                  {delivery.customer_name || delivery.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {delivery.driver_name || 'Non assigné'}
                </p>
              </div>
              <div className="ml-auto font-medium">
                <div className={getStatusColor(delivery.status)}>
                  {getStatusLabel(delivery.status)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}