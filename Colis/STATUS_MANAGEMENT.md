# Système de Gestion des Statuts - Colis

## Vue d'ensemble

Le nouveau système de gestion des statuts permet aux préparateurs et livreurs de gérer l'état des colis de manière professionnelle avec des contrôles de permissions basés sur les rôles.

## Composants

### 1. ColisStatusManager
Component principal pour la gestion des statuts avec:
- Progression visuelle des statuts (Steps component)
- Actions rapides basées sur le rôle
- Dialog professionnel pour changements de statut
- Contrôles de permissions

### 2. Steps Component
Component de progression visuelle qui affiche:
- Statut actuel
- Statuts complétés
- Prochaines étapes

### 3. useUserRole Hook
Hook pour déterminer le rôle de l'utilisateur:
- `preparateur`: Peut changer de "Nouveau" vers "Préparé"
- `livreur`: Peut gérer les livraisons
- `admin`: Tous les droits

## Workflow des Statuts

```
Nouveau → Préparé → Enlevé → [Partiellement Livré] → Livré
    ↓         ↓        ↓              ↓               ↓
  Annulé   Annulé  Non Livré     Non Livré      Non Livré
```

### Permissions par Rôle

**Préparateur:**
- Nouveau → Préparé ✅
- Nouveau → Annulé ✅

**Livreur:**
- Préparé → Enlevé ✅
- Enlevé → Partiellement Livré ✅
- Enlevé → Livré ✅
- Enlevé → Non Livré ✅
- Partiellement Livré → Livré ✅
- Partiellement Livré → Non Livré ✅
- Non Livré → Livré ✅
- Non Livré → Enlevé ✅

**Admin:**
- Toutes les transitions ✅

## Actions Rapides

Le composant fournit des boutons d'action rapide basés sur le contexte:

- **Préparateur + Statut "Nouveau"**: "Marquer comme préparé"
- **Livreur + Statut "Préparé"**: "Marquer comme enlevé"
- **Livreur + Statut "Enlevé/Partiellement Livré"**: "Marquer comme livré"

## Configuration du Rôle Utilisateur

Le rôle est déterminé dans `useUserRole.ts`:

```typescript
// Par email
if (userEmail.includes('preparateur')) return 'preparateur';
if (userEmail.includes('livreur')) return 'livreur';

// Par rôles Frappe
if (userRoles.some(role => role.role === 'Preparateur')) return 'preparateur';
if (userRoles.some(role => role.role === 'Livreur')) return 'livreur';

// Admin par défaut
return 'admin';
```

## Utilisation

```tsx
<ColisStatusManager
  currentStatus={localColisData.status || 'Nouveau'}
  onStatusChange={handleStatusChange}
  canChangeStatus={true}
  userRole={userRole}
  isLoading={isSaving}
/>
```

## Personnalisation

Pour ajouter de nouveaux statuts ou modifier les permissions:

1. Modifier `statusWorkflow` dans `ColisStatusManager.tsx`
2. Ajouter les couleurs dans `getStatusColor()`
3. Ajouter les icônes dans `getStatusIcon()`
4. Mettre à jour `createStepsFromStatus()` si nécessaire

## Interface Utilisateur

- **Progression visuelle**: Affichage des étapes avec statuts complétés/en cours/à venir
- **Actions contextuelles**: Boutons d'action rapide selon le rôle et statut
- **Dialog professionnel**: Interface claire pour sélection de nouveaux statuts
- **Responsive**: Optimisé pour mobile et desktop