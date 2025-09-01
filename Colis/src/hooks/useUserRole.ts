import { useFrappeGetDoc } from 'frappe-react-sdk';

export type UserRole = 'preparateur' | 'livreur' | 'admin';

export function useUserRole(currentUser: string | null | undefined): UserRole {
  const { data: userData } = useFrappeGetDoc("User", currentUser || undefined);
  
  // Determine role based on user data
  // This can be customized based on your user role system
  const userEmail = (userData as any)?.email || currentUser || '';
  const userRoles = (userData as any)?.roles || [];
  
  // Check for specific roles in Frappe
  if (userRoles.some((role: any) => role.role === 'System Manager' || role.role === 'Administrator')) {
    return 'admin';
  }
  
  // Check for custom roles or email patterns
  if (userEmail.includes('preparateur') || userRoles.some((role: any) => role.role === 'Preparateur')) {
    return 'preparateur';
  }
  
  if (userEmail.includes('livreur') || userRoles.some((role: any) => role.role === 'Livreur')) {
    return 'livreur';
  }
  
  // Default to admin for now - you can modify this logic
  return 'admin';
}

export function canChangeStatus(currentStatus: string, userRole: UserRole): boolean {
  const statusPermissions: Record<string, UserRole[]> = {
    'Nouveau': ['preparateur', 'admin'],
    'Préparé': ['livreur', 'admin'],
    'Enlevé': ['livreur', 'admin'],
    'Partiellement Livré': ['livreur', 'admin'],
    'Livré': ['admin'],
    'Non Livré': ['livreur', 'admin'],
    'Annulé': ['admin'],
  };
  
  const allowedRoles = statusPermissions[currentStatus] || ['admin'];
  return allowedRoles.includes(userRole);
}