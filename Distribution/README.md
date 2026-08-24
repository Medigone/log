# IntraPro Distribution

Frontend React/Frappe des opérations de distribution :

- préparation des commandes et contrôle du picking ;
- planification manuelle des tournées et des ressources ;
- livraison mobile, paiement et preuves ;
- suivi public limité des bons de livraison.

## Développement local

```bash
yarn dev
yarn typecheck
yarn lint
yarn test
```

La page Frappe cible est `/distribution` et les routes applicatives utilisent `HashRouter`.
Les migrations, builds et redémarrages Bench restent des opérations manuelles.
