# Spécification – Répartition Automatique des Livraisons (v2)

## 1) Contexte & objectifs

Le système actuel attribue les bons de livraison **par commune entière** à un seul livreur, avec un scoring basique, et mélange les notions de charge **globale** et **du jour**. Résultat : dépassements de capacité, absence de split entre livreurs, et rejets excessifs dès qu’un “meilleur” candidat n’a pas de capacité.

**Objectifs v2**

* Respect strict des **capacités par jour** (aucun livreur > 100%).
* **Unifier** la notion de charge : travailler en **charge projetée du jour**.
* Permettre le **split** d’une même commune entre plusieurs livreurs si nécessaire.
* Améliorer le **scoring** (équilibrage/cost/priorité) et tester **plusieurs candidats**.
* Fallback intelligent si aucune “couverture” explicite n’existe.
* Mode **simulation enrichi** (capacités, raisons, suggestions) et création **atomique**.

---

## 2) Problèmes actuels (diagnostic)

1. Sélection par **charge du jour**, mais incrément de **charge globale** (`Livreur.charge_actuelle`).
2. Attribution **monolithique par commune** (pas de split) → dépassements.
3. Si le meilleur candidat est plein, on **retourne None** au lieu d’essayer le suivant.
4. Poids de "zone" = 0 (déjà filtré), donc scoring **inefficace à 25%**.
5. Source de vérité des **colis** parfois `custom_nombre_colis` (peut diverger du réel après sync).

---

## 3) Principes v2

* **Aucune écriture DB** pendant la construction de la répartition. On travaille en **mémoire** avec une map `charges_jour`.
* **Capacité** contrôlée **avant** l’attribution. Si le meilleur n’a pas la place → on teste le **second**, etc.
* **Split** des communes si `nb_colis_total` > capacité restante d’un livreur.
* **Scoring utile** à 100% (3 facteurs) + tie-breakers déterministes.
* **Fallback couverture**: si aucun livreur n’est marqué pour la commune/wilaya, on considère les livreurs compatibles par classification (et optionnellement tous les actifs) – mais toujours sous contrainte de capacité.
* **Création atomique**: si tout est plaçable → transaction → créations; sinon → on ne crée rien.

---

## 4) Modèle de données (mémoire)

```text
charges_jour: dict[str Livre ur -> int nb_colis]
capacites:    dict[str Livre ur -> int capacite_max_colis]
repartition:  dict[str Livre ur -> list[DeliveryNoteLite]]
rejets:       list[{commune, raison, details}]
```

> `DeliveryNoteLite` = (bon\_de\_livraison, commune, customer, nb\_colis, total\_qty, grand\_total)

**Fonctions utilitaires**

```python
capacite_restante(livreur_id) -> int
reserver_charge(livreur_id, nb) -> bool  # maj charges_jour en mémoire
```

---

## 5) Scoring (v2)

**Facteurs**

* Équilibrage (charge relative du jour) – **0.60**
* Coût/km du véhicule (normalisé) – **0.25**
* Priorité d’attribution (1..10 ; petit = prioritaire) – **0.15**

**Formule**

```python
score = 0.60 * taux_charge + 0.25 * cout_norm + 0.15 * (1 - prio_norm)
```

**Tie-breakers**

1. plus grande **capacité restante**
2. plus petite **charge absolue** du jour
3. plus petite **priorité**

---

## 6) Sélection des candidats

1. Filtrer **actifs** + **compatibles** avec la classification (Locale/Régionale/Éloignée).
2. Restreindre aux **livreurs couvrant** la commune ; sinon **fallback** (classification, puis tous actifs si option activée).
3. Filtrer par **capacité restante ≥ nb\_colis\_requis**.
4. Calculer scores puis **trier**.
5. **Essayer en cascade** chaque candidat trié : le premier qui passe la capacité est retenu.

---

## 7) Split d’une commune (si nécessaire)

* Si `nb_colis_total` d’une commune > capacité du **meilleur**, on la **découpe** en paquets.
* **Heuristique simple**: First-Fit Decreasing (FFD)

  * Suivre l’ordre des **candidats triés** par score.
  * Pour chaque candidat, attribuer `min(cap_restante, nb_colis_restant)`.
  * Continuer jusqu’à `nb_colis_restant == 0` ou épuisement des candidats.
* Si des colis restent **non placés** → **rejet** (mode simulation) ou passage en **manuel**.

**Granularité du split**

* Par défaut **au niveau DN** (si chaque DN a `custom_nombre_colis`).
* Option avancée : split **intra-DN** si tu modélises les colis individuellement (à activer plus tard).

---

## 8) Source de vérité des colis

* **Recommandé**: compter les **Colis réels** (`tabColis`) reliés à la DN pour la capacité.
* Alternative: utiliser `custom_nombre_colis` mais **revalider** juste avant création; si divergence → recalcul ou manuel.

---

## 9) Mode Simulation enrichi

Retourner :

* Répartition proposée (livreur → communes/DN → nb\_colis),
* **Capacités restantes** par livreur avant/après,
* **Raisons** pour chaque **rejet** (ex. « pas de livreur éligible », « capacité insuffisante »),
* **Suggestions Top-3** par rejet (candidats avec score et capacité manquante).

---

## 10) Flux complet (pseudo-code)

```python
def repartir_v2(date, mode="auto", simulate=True, manual_assignments=None):
    # Préparer contexte
    charges_jour = calculer_charges_par_date(date)
    capacites = get_capacites_livreurs_actifs()
    repartition = defaultdict(list)
    rejets = []

    bons_par_commune = charger_bons_groupes(date)  # inclut nb_colis réel

    if mode == "manuel" and manual_assignments:
        # Respecter l’assignation fournie mais sous contrainte de capacité
        for commune, bons in bons_par_commune.items():
            cible = manual_assignments.get(commune)
            if not cible:
                rejets.append({"commune": commune, "raison": "assignation manquante"})
                continue
            nb = total_colis(bons)
            if capacite_restante(cible) >= nb:
                reserver_charge(cible, nb)
                repartition[cible].extend(bons)
            else:
                # Split sur la même cible ou rejeter
                lot = min(capacite_restante(cible), nb)
                if lot > 0:
                    repartition[cible].extend(prendre_colis(bons, lot))
                    reserver_charge(cible, lot)
                    nb -= lot
                if nb > 0:
                    rejets.append({"commune": commune, "raison": "capacité insuffisante manuel", "reste": nb})
        return snapshot(...)

    # Mode automatique
    for commune, bons in order_heuristic(bons_par_commune):  # ex: trier par nb_colis desc
        nb = total_colis(bons)
        candidats = candidats_eligibles(commune, date)
        candidats = filtrer_par_capacite_restante(candidats, nb)
        candidats_scored = scorer_et_trier(candidats, charges_jour, capacites)

        # Candidat unique suffisant
        cible = premier_qui_passe(candidats_scored, nb)
        if cible:
            reserver_charge(cible, nb)
            repartition[cible].extend(bons)
            continue

        # Split FFD si personne ne peut prendre tout le lot
        reste = nb
        for c in candidats_scored:
            cap = capacite_restante(c)
            if cap <= 0:
                continue
            take = min(cap, reste)
            if take > 0:
                repartition[c].extend(prendre_colis(bons, take))
                reserver_charge(c, take)
                reste -= take
            if reste == 0:
                break

        if reste > 0:
            rejets.append({"commune": commune, "raison": "capacité insuffisante", "reste": reste})

    if simulate:
        return snapshot(repartition, charges_jour, capacites, rejets)

    if rejets:
        # Pas de création si tout n’est pas plaçable (ou paramètre allow_partial)
        return {"success": False, "requires_manual_selection": True, "rejets": rejets, ...}

    # Création atomique
    with db_txn():
        for livreur, bons in repartition.items():
            create_livraison(livreur, date, bons)

    return {"success": True, "repartition": ...}
```

---

## 11) API & signatures inchangées (compatibilité)

* Conserver `repartir_livraisons_automatique(date, mode, simulate, manual_assignments)`.
* Ajouter dans la réponse **simulation**: `capacites_avant`, `capacites_apres`, `rejets`, `suggestions`.
* Ne plus incrémenter `Livreur.charge_actuelle` pendant l’algorithme.

---

## 12) Tests (cas à couvrir)

1. **Équilibrage simple**: 2 livreurs, capacité 3 chacun, 4 colis (2 communes) → 2+2.
2. **Split nécessaire**: 1 commune 5 colis, 3 livreurs cap 2 → 2/2/1.
3. **Candidat top plein**: meilleur score insuffisant → on choisit le 2ᵉ ou 3ᵉ.
4. **Pas de couverture explicite**: fallback par classification fonctionne.
5. **Divergence nb\_colis** (custom vs réel) : déclenche revalidation.
6. **Simulation**: rejets renseignés + top-3 suggestions.
7. **Création atomique**: roll-back si exception.

---

## 13) Observabilité & métriques

* % de capacité utilisée par livreur (avg / max).
* Répartition colis/livreur (avg / stddev).
* # communes split, # rejets et **raisons**.
* Score moyen du livreur retenu vs 2ᵉ meilleur.

---

## 14) Roadmap d’implémentation

1. Introduire **buffer mémoire** `charges_jour` + utilitaires `capacite_restante/reserver_charge`.
2. Refactor **scoring** + filtrage par capacité **avant** scoring.
3. Sélection **multi-candidats** (essai en cascade).
4. **Split FFD** des communes.
5. **Simulation enrichie** (capacités/raisons/suggestions).
6. Création **atomique** et revalidation nb\_colis.
7. Logs & métriques.

---

## 15) Notes d’intégration UI

* Afficher par livreur : nb colis, nb communes, nb DN, **taux de charge**.
* Badges pour **rejets** avec raisons + **bouton** « Assigner manuellement » par commune rejetée.
* En simulation, afficher **capacités avant/après**.
* Option **Allow partial create** (par défaut OFF) si tu veux créer ce qui est plaçable et laisser le reste au manuel.

---

## 16) Annexes – Helpers (extraits)

**Normalisation & score**

```python
def normalise(x, lo, hi):
    if hi == lo:
        return 0.0
    return max(0.0, min(1.0, (x - lo) / float(hi - lo)))

# score = 0.60*taux_charge + 0.25*cout_norm + 0.15*(1 - prio_norm)
```

**Try-next candidate**

```python
def choisir_candidat(candidats_tries, nb):
    for c in candidats_tries:
        if capacite_restante(c.name) >= nb:
            return c.name
    return None
```

**Split FFD**

```python
def split_ffd(candidats_tries, bons, nb):
    reste = nb
    attribution = []  # list[(livreur_id, nb_colis)]
    for c in candidats_tries:
        cap = capacite_restante(c.name)
        if cap <= 0:
            continue
        take = min(cap, reste)
        if take > 0:
            attribution.append((c.name, take))
            reserver_charge(c.name, take)
            reste -= take
        if reste == 0:
            break
    return attribution, reste
```

**Top-3 suggestions**

```python
def suggestions(candidats_tries, nb):
    out = []
    for c in candidats_tries[:3]:
        out.append({
            "livreur": c.name,
            "cap_restante": capacite_restante(c.name),
            "score": c._score,
            "manque": max(0, nb - capacite_restante(c.name)),
        })
    return out
```
