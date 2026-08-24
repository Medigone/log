import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Trophy, Truck } from "lucide-react";
import type { TopDriver } from "../hooks/useDashboardData";

/* =========================
   Types
   ========================= */
interface TopDriversProps {
  data: TopDriver[];
  isLoading: boolean;
}

/* =========================
   Component
   ========================= */
/* =========================
   Helper Functions
   ========================= */
const getRankIcon = (index: number) => {
  switch (index) {
    case 0:
      return "🥇";
    case 1:
      return "🥈";
    case 2:
      return "🥉";
    default:
      return `${index + 1}`;
  }
};

const getSuccessRateColor = (rate: number) => {
  if (rate >= 90) return "text-green-600";
  if (rate >= 75) return "text-yellow-600";
  return "text-red-600";
};

/* =========================
   Component
   ========================= */
export function TopDrivers({ data, isLoading }: TopDriversProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, index) => (
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
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Aucune donnée
            </CardTitle>
            <Trophy className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">livreurs</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {data.slice(0, 4).map((driver, index) => (
        <Card key={driver.name}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {getRankIcon(index)} {driver.name}
            </CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{driver.deliveries}</div>
            <p className="text-xs text-muted-foreground">
              {driver.deliveries === 1 ? 'livraison' : 'livraisons'} •{' '}
              <span className={getSuccessRateColor(driver.success_rate)}>
                {driver.success_rate}% réussite
              </span>
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}