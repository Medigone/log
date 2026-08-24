import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Truck, 
  Users, 
  Package, 
  Car,
  TrendingUp,
  TrendingDown,
  Activity
} from "lucide-react";
import { useDashboardData } from "./hooks/useDashboardData";
import { 
  KPICards, 
  DeliveryChart, 
  StatusChart, 
  TopDrivers, 
  RecentDeliveries 
} from "./components";

/* =========================
   Types
   ========================= */
export type PeriodFilter = 'today' | '7d' | '30d' | '3m' | '6m' | 'year';

interface DashboardProps {}

/* =========================
   Component
   ========================= */
const Dashboard = ({}: DashboardProps) => {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>('30d');
  
  const {
    kpiData,
    chartData,
    topDriversData,
    recentDeliveriesData,
    isLoading,
    error
  } = useDashboardData(selectedPeriod);

  const periodOptions = [
    { value: 'today', label: 'Aujourd\'hui' },
    { value: '7d', label: '7 derniers jours' },
    { value: '30d', label: '30 derniers jours' },
    { value: '3m', label: '3 derniers mois' },
    { value: '6m', label: '6 derniers mois' },
    { value: 'year', label: 'Cette année' }
  ];

  return (
    <div className="flex-1 space-y-4 p-4 pt-16 md:ml-64 md:pt-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            Voici un aperçu de vos performances de livraison
            {isLoading && (
              <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium">
                <Activity className="w-3 h-3 mr-1 animate-spin" />
                Chargement...
              </span>
            )}
            {error && !isLoading && (
              <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-medium">
                Mode démonstration
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Select value={selectedPeriod} onValueChange={(value: PeriodFilter) => setSelectedPeriod(value)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {periodOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICards data={kpiData} isLoading={isLoading} />
      </div>

      {/* Main Charts Row */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-7">
        <div className="col-span-1 lg:col-span-4">
          <DeliveryChart data={chartData?.deliveryTrends} isLoading={isLoading} />
        </div>
        <div className="col-span-1 lg:col-span-3">
          <StatusChart data={chartData?.statusDistribution} isLoading={isLoading} />
        </div>
      </div>

      {/* Top Performers */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Top Livreurs</h3>
          <p className="text-sm text-muted-foreground">Vos meilleurs performers ce mois-ci</p>
        </div>
        <TopDrivers data={topDriversData} isLoading={isLoading} />
      </div>

      {/* Recent Activity */}
      <RecentDeliveries data={recentDeliveriesData} isLoading={isLoading} />
    </div>
  );
};

export default Dashboard;