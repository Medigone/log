import { useMemo } from "react";
import { useFrappeGetDocList } from "frappe-react-sdk";
import type { PeriodFilter } from "../Dashboard";

/* =========================
   Types
   ========================= */
export interface KPIData {
  totalDeliveries: number;
  totalDeliveriesTrend: 'up' | 'down' | 'neutral';
  totalDeliveriesTrendValue: number;
  todayDeliveries: number;
  todayDeliveriesTrend: 'up' | 'down' | 'neutral';
  todayDeliveriesTrendValue: number;
  tomorrowDeliveries: number;
  tomorrowDeliveriesTrend: 'up' | 'down' | 'neutral';
  tomorrowDeliveriesTrendValue: number;
  activeDrivers: number;
  activeDriversTrend: 'up' | 'down' | 'neutral';
  activeDriversTrendValue: number;
  availableVehicles: number;
}

export interface ChartData {
  deliveryTrends: Array<{
    date: string;
    nouveau: number;
    en_cours: number;
    livre: number;
    annule: number;
  }>;
  statusDistribution: Array<{
    name: string;
    value: number;
    color: string;
  }>;
}

export interface TopDriver {
  name: string;
  deliveries: number;
  success_rate: number;
  vehicle: string;
}

export interface RecentDelivery {
  name: string;
  customer_name: string;
  status: string;
  driver_name: string;
  creation: string;
  modified: string;
  delivery_address: string;
}

export interface DashboardData {
  kpiData: KPIData;
  chartData: ChartData;
  topDriversData: TopDriver[];
  recentDeliveriesData: RecentDelivery[];
  isLoading: boolean;
  error: Error | null;
}

/* =========================
   Helper Functions
   ========================= */
function getDateFilter(period: PeriodFilter) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (period) {
    case 'today':
      return [today.toISOString().split('T')[0], today.toISOString().split('T')[0]];
    case '7d':
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return [weekAgo.toISOString().split('T')[0], today.toISOString().split('T')[0]];
    case '30d':
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      return [monthAgo.toISOString().split('T')[0], today.toISOString().split('T')[0]];
    case '3m':
      const threeMonthsAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
      return [threeMonthsAgo.toISOString().split('T')[0], today.toISOString().split('T')[0]];
    case '6m':
      const sixMonthsAgo = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000);
      return [sixMonthsAgo.toISOString().split('T')[0], today.toISOString().split('T')[0]];
    case 'year':
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return [yearStart.toISOString().split('T')[0], today.toISOString().split('T')[0]];
    default:
      const defaultMonthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      return [defaultMonthAgo.toISOString().split('T')[0], today.toISOString().split('T')[0]];
  }
}

function generateDemoData() {
  // Generate demo delivery trends data
  const deliveryTrends = [];
  const today = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    
    deliveryTrends.push({
      date: dateStr,
      nouveau: Math.floor(Math.random() * 20) + 5,
      en_cours: Math.floor(Math.random() * 15) + 3,
      livre: Math.floor(Math.random() * 25) + 10,
      annule: Math.floor(Math.random() * 5) + 1
    });
  }
  
  return {
    kpiData: {
      totalDeliveries: 247,
      totalDeliveriesTrend: 'up' as const,
      totalDeliveriesTrendValue: 12.5,
      todayDeliveries: 18,
      todayDeliveriesTrend: 'up' as const,
      todayDeliveriesTrendValue: 8.2,
      tomorrowDeliveries: 22,
      tomorrowDeliveriesTrend: 'up' as const,
      tomorrowDeliveriesTrendValue: 15.8,
      activeDrivers: 12,
      activeDriversTrend: 'neutral' as const,
      activeDriversTrendValue: 0,
      availableVehicles: 15
    },
    chartData: {
      deliveryTrends,
      statusDistribution: [
        { name: 'Livré', value: 156, color: '#10b981' },
        { name: 'En cours', value: 45, color: '#f59e0b' },
        { name: 'Nouveau', value: 32, color: '#3b82f6' },
        { name: 'Annulé', value: 14, color: '#ef4444' }
      ]
    },
    topDriversData: [
      { name: 'Ahmed Benali', deliveries: 45, success_rate: 95, vehicle: 'VH-001' },
      { name: 'Mohamed Kaddour', deliveries: 38, success_rate: 92, vehicle: 'VH-003' },
      { name: 'Youssef Mansouri', deliveries: 34, success_rate: 88, vehicle: 'VH-007' },
      { name: 'Omar Tazi', deliveries: 29, success_rate: 91, vehicle: 'VH-012' },
      { name: 'Karim Alami', deliveries: 25, success_rate: 86, vehicle: 'VH-018' }
    ],
    recentDeliveriesData: [
      {
        name: 'LIV-2025-001',
        customer_name: 'SARL Atlantique',
        status: 'livre',
        driver_name: 'Ahmed Benali',
        creation: new Date().toISOString(),
        modified: new Date().toISOString(),
        delivery_address: 'Casablanca, Maarif'
      },
      {
        name: 'LIV-2025-002',
        customer_name: 'Entreprise Moderne',
        status: 'en_cours',
        driver_name: 'Mohamed Kaddour',
        creation: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        modified: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        delivery_address: 'Rabat, Agdal'
      },
      {
        name: 'LIV-2025-003',
        customer_name: 'Distribution Plus',
        status: 'nouveau',
        driver_name: 'Non assigné',
        creation: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        modified: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        delivery_address: 'Marrakech, Gueliz'
      }
    ]
  };
}

/* =========================
   Main Hook
   ========================= */
export function useDashboardData(period: PeriodFilter): DashboardData {
  const [startDate, endDate] = getDateFilter(period);
  
  console.log('Dashboard date range:', { startDate, endDate, period });
  
  // Fetch Livraisons data with proper date filtering and optimized limit
  const { 
    data: livraisonsData, 
    error: livraisonsError, 
    isLoading: livraisonsLoading 
  } = useFrappeGetDocList('Livraison', {
    fields: ['name', 'status', 'creation', 'modified', 'livreur', 'date_liv', 'vehicule'],
    filters: [
      ['date_liv', '>=', startDate],
      ['date_liv', '<=', endDate]
    ],
    limit: 500, // Reduced limit for better performance
    orderBy: {
      field: 'date_liv',
      order: 'desc'
    }
  });

  console.log('Livraisons data:', { 
    data: livraisonsData, 
    count: livraisonsData?.length,
    error: livraisonsError, 
    loading: livraisonsLoading,
    sample: livraisonsData?.[0]
  });

  // Fetch Colis data with proper date filtering and optimized limit
  const { 
    data: colisData, 
    error: colisError, 
    isLoading: colisLoading 
  } = useFrappeGetDocList('Colis', {
    fields: ['name', 'status', 'creation', 'modified'],
    filters: [
      ['creation', '>=', startDate],
      ['creation', '<=', endDate + ' 23:59:59']
    ],
    limit: 300 // Reduced limit for better performance
  });

  // Skip Delivery Notes for now since it might not exist
  const deliveryNotesData = null;
  const deliveryNotesError = null;
  const deliveryNotesLoading = false;

  // Fetch Livreurs data for driver names (optimized)
  const { data: livreursData } = useFrappeGetDocList('Livreur', {
    fields: ['name', 'nom', 'status'],
    limit: 100 // Reduced limit - typically fewer drivers
  });

  // Fetch Vehicules data for vehicle names (optimized)
  const { data: vehiculesData } = useFrappeGetDocList('Vehicule', {
    fields: ['name', 'nom'],
    limit: 100 // Reduced limit - typically fewer vehicles
  });

  console.log('Livreurs data:', livreursData?.length ? livreursData : 'No drivers');
  console.log('Vehicules data:', vehiculesData?.length ? vehiculesData : 'No vehicles');

  // Calculate derived data with error handling and fallback
  const derivedData = useMemo(() => {
    console.log('useMemo starting', { livraisonsData, vehiculesData, livreursData });
    
    // If critical APIs failed, provide demo data with better error reporting
    if (livraisonsError && !livraisonsData) {
      console.error('Critical API error - Livraisons data failed:', {
        error: livraisonsError?.message,
        period,
        startDate,
        endDate
      });
      
      return generateDemoData();
    }
    
    // Log non-critical errors but continue with available data
    if (colisError) {
      console.warn('Non-critical API error - Colis data failed:', colisError?.message);
    }
    
    // If no delivery data available, still show some structure
    if (!livraisonsData || livraisonsData.length === 0) {
      console.log('No delivery data available, showing empty state with vehicle count:', vehiculesData?.length);
      return {
        kpiData: {
          totalDeliveries: 0,
          totalDeliveriesTrend: 'neutral' as const,
          totalDeliveriesTrendValue: 0,
          todayDeliveries: 0,
          todayDeliveriesTrend: 'neutral' as const,
          todayDeliveriesTrendValue: 0,
          tomorrowDeliveries: 0,
          tomorrowDeliveriesTrend: 'neutral' as const,
          tomorrowDeliveriesTrendValue: 0,
          activeDrivers: 0,
          activeDriversTrend: 'neutral' as const,
          activeDriversTrendValue: 0,
          availableVehicles: vehiculesData?.length || 0
        },
        chartData: {
          deliveryTrends: [],
          statusDistribution: []
        },
        topDriversData: [],
        recentDeliveriesData: []
      };
    }
    
    // Use available data or empty arrays if none
    const allDeliveries = [...(livraisonsData || [])];
    
    // Data is already filtered by the API, no need for client-side filtering
    const filteredDeliveries = allDeliveries.filter(delivery => {
      return delivery.creation; // Just ensure creation date exists
    });
    
    // Create mappings (simple object creation, no useMemo needed inside)
    const livreursMap: Record<string, string> = {};
    if (livreursData) {
      livreursData.forEach(livreur => {
        livreursMap[livreur.name] = livreur.nom;
      });
    }

    const vehiculesMap: Record<string, string> = {};
    if (vehiculesData) {
      vehiculesData.forEach(vehicule => {
        vehiculesMap[vehicule.name] = vehicule.nom;
      });
    }
    
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Use date_liv for today's and tomorrow's deliveries
    const todayDeliveries = allDeliveries.filter(d => d.date_liv?.startsWith(today));
    const tomorrowDeliveries = allDeliveries.filter(d => d.date_liv?.startsWith(tomorrow));

    console.log('Raw deliveries data:', {
      total: livraisonsData?.length || 0,
      rawData: livraisonsData?.map(d => ({
        name: d.name,
        date_liv: d.date_liv,
        creation: d.creation,
        livreur: d.livreur,
        status: d.status
      })) || []
    });
    
    console.log('Date filter:', {
      startDate,
      endDate,
      period
    });
    
    console.log('Filtered deliveries:', { 
      total: allDeliveries.length, 
      filtered: filteredDeliveries.length, 
      today: todayDeliveries.length,
      tomorrow: tomorrowDeliveries.length,
      period,
      startDate,
      endDate,
      sampleDelivery: allDeliveries[0],
      filteredData: filteredDeliveries?.map(d => ({
        name: d.name,
        date_liv: d.date_liv,
        creation: d.creation,
        livreur: d.livreur,
        status: d.status
      })) || []
    });

    // Calculate active drivers based on status field
    const activeDriversFromStatus = livreursData?.filter(livreur => 
      livreur.status === 'Actif' || livreur.status === 'Active'
    ) || [];
    
    console.log('Active drivers debug:', {
      totalDriversFromAPI: livreursData?.length || 0,
      activeDriversFromStatus: activeDriversFromStatus.map(d => ({ name: d.name, nom: d.nom, status: d.status })),
      activeDriversCount: activeDriversFromStatus.length,
      allDriversWithStatus: livreursData?.map(d => ({ name: d.name, nom: d.nom, status: d.status })) || []
    });

    // KPI Data
    const kpiData: KPIData = {
      totalDeliveries: filteredDeliveries.length,
      totalDeliveriesTrend: 'up',
      totalDeliveriesTrendValue: 12.5,
      todayDeliveries: todayDeliveries.length,
      todayDeliveriesTrend: 'up',
      todayDeliveriesTrendValue: 8.2,
      tomorrowDeliveries: tomorrowDeliveries.length,
      tomorrowDeliveriesTrend: 'neutral',
      tomorrowDeliveriesTrendValue: 0,
      activeDrivers: activeDriversFromStatus.length,
      activeDriversTrend: 'neutral',
      activeDriversTrendValue: 0,
      availableVehicles: vehiculesData?.length || 0
    };
    
    console.log('KPI Data calculated:', kpiData);

    // Status Distribution
    const statusCounts: Record<string, number> = {};
    filteredDeliveries.forEach(delivery => {
      const status = delivery.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    console.log('Status counts:', statusCounts);

    const statusColors: Record<string, string> = {
      'Nouveau': '#3b82f6',
      'Brouillon': '#3b82f6',
      'Draft': '#3b82f6',
      'Enlevé': '#f59e0b',
      'To Deliver': '#f59e0b',
      'Préparé': '#06b6d4',
      'Livré': '#10b981',
      'Delivered': '#10b981',
      'Annulé': '#ef4444',
      'Cancelled': '#ef4444',
      'unknown': '#6b7280'
    };

    const statusDistribution = Object.entries(statusCounts).map(([status, count]) => ({
      name: status,
      value: count,
      color: statusColors[status] || statusColors.unknown
    }));

    // Delivery Trends (group by date)
    const trendsByDate: Record<string, Record<string, number>> = {};
    filteredDeliveries.forEach(delivery => {
      const date = delivery.date_liv?.split('T')[0] || delivery.creation?.split('T')[0] || '';
      const status = delivery.status || 'unknown';
      
      if (!trendsByDate[date]) {
        trendsByDate[date] = { nouveau: 0, en_cours: 0, livre: 0, annule: 0 };
      }
      
      // Map French status names to chart categories
      if (status === 'Nouveau' || status === 'Brouillon' || status === 'Draft') {
        trendsByDate[date].nouveau++;
      } else if (status === 'Enlevé' || status === 'To Deliver' || status === 'Préparé') {
        trendsByDate[date].en_cours++;
      } else if (status === 'Livré' || status === 'Delivered') {
        trendsByDate[date].livre++;
      } else if (status === 'Annulé' || status === 'Cancelled') {
        trendsByDate[date].annule++;
      }
    });

    const deliveryTrends = Object.entries(trendsByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({
        date,
        nouveau: counts.nouveau || 0,
        en_cours: counts.en_cours || 0,
        livre: counts.livre || 0,
        annule: counts.annule || 0
      }));

    // Top Drivers
    const driverStats: Record<string, { deliveries: number; success: number }> = {};
    filteredDeliveries?.forEach(delivery => {
      if (delivery.livreur) {
        if (!driverStats[delivery.livreur]) {
          driverStats[delivery.livreur] = { deliveries: 0, success: 0 };
        }
        driverStats[delivery.livreur].deliveries++;
        if (delivery.status === 'Livré' || delivery.status === 'Delivered') {
          driverStats[delivery.livreur].success++;
        }
      }
    });

    console.log('Top drivers debug:', {
      filteredDeliveriesCount: filteredDeliveries?.length || 0,
      deliveriesWithDrivers: filteredDeliveries?.filter(d => d.livreur).length || 0,
      driverStats,
      livreursMap,
      vehiculesMap,
      sampleDeliveries: filteredDeliveries?.slice(0, 3).map(d => ({ name: d.name, livreur: d.livreur, vehicule: d.vehicule, status: d.status })) || []
    });

    const topDriversData = Object.entries(driverStats)
      .map(([driverId, stats]) => ({
        name: livreursMap[driverId] || driverId,
        deliveries: stats.deliveries,
        success_rate: stats.deliveries > 0 ? Math.round((stats.success / stats.deliveries) * 100) : 0,
        vehicle: vehiculesMap[filteredDeliveries?.find(d => d.livreur === driverId)?.vehicule || ''] || 'Non assigné'
      }))
      .sort((a, b) => b.deliveries - a.deliveries)
      .slice(0, 5);

    console.log('Top drivers result:', topDriversData);

    // Recent Deliveries
    const recentDeliveriesData = allDeliveries
      .sort((a, b) => (b.creation || '').localeCompare(a.creation || ''))
      .slice(0, 5)
      .map(delivery => ({
        name: delivery.name || '',
        customer_name: 'Client', // We don't have customer name in Livraison doctype
        status: delivery.status || 'unknown',
        driver_name: livreursMap[delivery.livreur || ''] || delivery.livreur || 'Non assigné',
        creation: delivery.creation || '',
        modified: delivery.modified || '',
        delivery_address: '' // We don't have delivery address in Livraison doctype
      }));

    return {
      kpiData,
      chartData: {
        deliveryTrends,
        statusDistribution
      },
      topDriversData,
      recentDeliveriesData
    };
  }, [livraisonsData, colisData, vehiculesData, livreursData, startDate, endDate]);

  const hasError = livraisonsError || colisError;
  const anyLoading = livraisonsLoading || colisLoading;
  
  return {
    ...derivedData,
    isLoading: anyLoading,
    error: hasError ? new Error('Failed to load dashboard data. Using demo data instead.') : null
  };
}