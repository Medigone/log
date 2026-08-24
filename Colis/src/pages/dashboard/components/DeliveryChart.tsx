import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

/* =========================
   Types
   ========================= */
interface DeliveryChartProps {
  data?: Array<{
    date: string;
    nouveau: number;
    en_cours: number;
    livre: number;
    annule: number;
  }>;
  isLoading: boolean;
}

/* =========================
   Helper Functions
   ========================= */
function formatDate(dateStr: string) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { 
      month: 'short', 
      day: 'numeric' 
    });
  } catch {
    return dateStr;
  }
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const totalValue = payload.find((p: any) => p.dataKey === 'total')?.value || 0;
    return (
      <div className="bg-background border border-border rounded-md p-3 shadow-lg">
        <p className="text-sm font-medium text-foreground mb-2">
          {label}
        </p>
        <p className="text-xs text-blue-600">
          Total livraisons: {totalValue}
        </p>
      </div>
    );
  }
  return null;
}

/* =========================
   Component
   ========================= */
export function DeliveryChart({ data, isLoading }: DeliveryChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Évolution des Livraisons</CardTitle>
        </CardHeader>
        <CardContent className="pl-2">
          <div className="h-[300px] bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Évolution des Livraisons</CardTitle>
        </CardHeader>
        <CardContent className="pl-2">
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Aucune donnée disponible
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map(item => ({
    date: formatDate(item.date),
    total: item.nouveau + item.en_cours + item.livre + item.annule
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Évolution des Livraisons</CardTitle>
      </CardHeader>
      <CardContent className="pl-2">
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis 
                dataKey="date" 
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 12 }}
              />
              <YAxis 
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 12 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="total" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}