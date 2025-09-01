import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Truck, 
  Users, 
  Package, 
  Car,
  TrendingUp
} from "lucide-react";
import type { KPIData } from "../hooks/useDashboardData";

/* =========================
   Types
   ========================= */
interface KPICardsProps {
  data: KPIData;
  isLoading: boolean;
}



/* =========================
   Component
   ========================= */
export function KPICards({ data, isLoading }: KPICardsProps) {
  if (isLoading) {
    return (
      <>
        {[...Array(5)].map((_, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 bg-muted animate-pulse rounded w-24" />
              <div className="w-4 h-4 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted animate-pulse rounded w-16 mb-1" />
              <div className="h-3 bg-muted animate-pulse rounded w-20" />
            </CardContent>
          </Card>
        ))}
      </>
    );
  }

  const cards = [
    {
      title: "Total Livraisons",
      value: data.totalDeliveries.toLocaleString(),
      change: `+${data.totalDeliveriesTrendValue}%`,
      changeText: "par rapport au mois dernier",
      icon: Package,
      trend: data.totalDeliveriesTrend
    },
    {
      title: "Aujourd'hui",
      value: data.todayDeliveries.toLocaleString(),
      change: `+${data.todayDeliveriesTrendValue}%`,
      changeText: "par rapport à hier",
      icon: Truck,
      trend: data.todayDeliveriesTrend
    },
    {
      title: "Livreurs Actifs",
      value: data.activeDrivers.toLocaleString(),
      change: data.activeDriversTrendValue === 0 ? "Stable" : `${data.activeDriversTrendValue > 0 ? '+' : ''}${data.activeDriversTrendValue}%`,
      changeText: "ce mois-ci",
      icon: Users,
      trend: data.activeDriversTrend
    },
    {
      title: "Véhicules",
      value: data.availableVehicles.toLocaleString(),
      change: "Disponibles",
      changeText: "en ce moment",
      icon: Car,
      trend: 'neutral' as const
    }
  ];

  return (
    <>
      {cards.map((card, index) => {
        const Icon = card.icon;
        const isPositiveTrend = card.trend === 'up';
        const isNeutralTrend = card.trend === 'neutral';
        
        return (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {card.title}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground">
                <span className={`inline-flex items-center ${
                  isNeutralTrend 
                    ? 'text-muted-foreground' 
                    : isPositiveTrend 
                    ? 'text-emerald-600 dark:text-emerald-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {!isNeutralTrend && (
                    <TrendingUp className={`mr-1 h-3 w-3 ${
                      isPositiveTrend ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400 rotate-180'
                    }`} />
                  )}
                  {card.change}
                </span>
                {' '}{card.changeText}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}