# Vue Publique des Colis

Cette fonctionnalité permet aux clients d'accéder aux informations de leurs colis via QR code sans avoir besoin de se connecter.

## Fonctionnement

### Pour les utilisateurs connectés
- URL: `http://votre-site/Colis?colis=COLIS_ID`
- Accès complet avec toutes les fonctionnalités (édition, photos, commentaires, etc.)

### Pour les utilisateurs non connectés (vue publique)
- URL: `http://votre-site/Colis?colis=COLIS_ID`
- URL alternative: `http://votre-site/Colis?colis=COLIS_ID&public=1`
- Accès limité aux informations de consultation uniquement

## Informations affichées dans la vue publique

### Informations générales
- Numéro de séquence du colis
- Nom du client
- Date de création
- Statut du colis

### Liste des articles
- Nom de l'article
- Statut de l'article
- Quantité totale
- Quantité livrée
- Quantité restante
- Date de dernière livraison

## Sécurité

- L'API publique (`get_public_colis_data`) ne retourne que les informations essentielles
- Aucune information sensible n'est exposée (photos, commentaires, données internes)
- L'accès se fait uniquement via l'ID du colis

## Utilisation avec QR Code

1. Générer un QR code contenant l'URL: `http://votre-site/Colis?colis=COLIS_ID`
2. Le client scanne le QR code
3. Si non connecté, il voit automatiquement la vue publique
4. Si connecté (livreur), il voit la vue complète avec actions

## API Backend

### Endpoint public
```
GET /api/method/log.log.doctype.colis.colis.get_public_colis_data?colis_id=COLIS_ID
```

### Réponse
```json
{
  "message": {
    "id": "COLIS_ID",
    "custom_numero_sequence": "SEQ001",
    "status": "Partiellement Livré",
    "client": "Nom du Client",
    "date_creation": "2025-01-XX",
    "bl": "BL001",
    "articles": [
      {
        "id": "article_id",
        "article": "Nom Article",
        "statut_article": "Livré",
        "quantite_totale": 10,
        "quantite_livree": 8,
        "quantite_restante": 2,
        "date_derniere_livraison": "2025-01-XX"
      }
    ]
  }
}
```

## Fichiers modifiés

1. **Frontend**:
   - `src/App.tsx` - Logique de routage conditionnel
   - `src/pages/colis/ColisPublicView.tsx` - Nouvelle vue publique

2. **Backend**:
   - `log/log/doctype/colis/colis.py` - Nouvelle méthode API publique

## Tests

1. **Test utilisateur connecté**:
   - Se connecter et accéder à `?colis=COLIS_ID`
   - Vérifier que la vue complète s'affiche

2. **Test utilisateur non connecté**:
   - Se déconnecter et accéder à `?colis=COLIS_ID`
   - Vérifier que la vue publique s'affiche

3. **Test QR Code**:
   - Générer un QR code avec l'URL du colis
   - Scanner depuis un appareil non connecté
   - Vérifier l'affichage correct des informations