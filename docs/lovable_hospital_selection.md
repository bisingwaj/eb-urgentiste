# Documentation d'Intégration : Sélection Manuelle de l'Hôpital par l'Urgentiste

Ce document récapitule la logique implémentée pour permettre à l'urgentiste de sélectionner l'établissement de santé le plus proche directement depuis l'application mobile, en remplacement de l'affectation automatique par le dashboard central.

## 1. Flux Applicatif (Frontend)

Le flux de signalement suit désormais cette logique :
1. **Évaluation & Soins** : L'urgentiste effectue son bilan médical.
2. **Décision de Transport** : Une fois le transport décidé, l'application récupère la liste des établissements actifs (`is_open = true`) depuis la table `health_structures`.
3. **Calcul de Proximité** : L'application calcule en temps réel la distance entre la position GPS de l'urgentiste et chaque structure (Formule de Haversine).
4. **Sélection** : L'urgentiste choisit l'établissement dans une liste triée par distance.
5. **Requête (Pending)** : Une mise à jour est envoyée à la table `dispatches`. Le statut hospitalier passe à `pending`.
6. **Confirmation** : L'application attend que le statut du dispatch passe à `accepted` (via le portail hospitalier) pour déclencher la navigation GPS.

## 2. Intégration Base de Données (Supabase)

### Table : `dispatches`
Lorsqu'un urgentiste sélectionne un hôpital, les champs suivants sont mis à jour dans la table `dispatches` :

| Champ | Valeur / Action |
| :--- | :--- |
| `assigned_structure_id` | ID de l'établissement choisi |
| `assigned_structure_name` | Copie du nom de l'établissement (Snapshot) |
| `assigned_structure_lat` | Latitude de la structure |
| `assigned_structure_lng` | Longitude de la structure |
| `assigned_structure_phone` | Téléphone de contact |
| `hospital_status` | Initialisé à `'pending'` |
| `hospital_notes` | Réinitialisé à `NULL` (efface les refus précédents) |
| `updated_at` | `NOW()` |

### Table : `health_structures`
L'application consomme cette table pour afficher les options disponibles :
- **Filtre** : `is_open == true`.
- **Champs requis** : `id`, `name`, `lat`, `lng`, `type`, `available_beds`, `address`, `phone`.

## 3. Logique de Synchronisation Temps Réel

L'application mobile écoute les changements sur la ligne du dispatch via **Supabase Realtime**.

### États gérés :
- **`pending`** : Affiche un écran d'attente "Demande envoyée" à l'urgentiste.
- **`accepted`** : Déclenche automatiquement l'affichage du bouton "Départ Hôpital" et active le calcul d'itinéraire vers les coordonnées `assigned_structure_lat/lng`.
- **`refused`** : Affiche un message d'erreur et ramène l'urgentiste à la liste des hôpitaux pour une nouvelle sélection.

## 4. Recommandations pour le Portail Hospitalier (Lovable)

Pour que ce flux soit complet, le portail hospitalier doit :
1. Écouter les `dispatches` où `assigned_structure_id` correspond à son ID et où `hospital_status == 'pending'`.
2. Permettre à l'utilisateur hospitalier de cliquer sur "Accepter" (passe status à `accepted`) ou "Refuser" (passe status à `refused`).
3. **Important** : Les coordonnées GPS de l'hôpital ne sont révélées à l'urgentiste que si le statut est `accepted` pour des raisons de confidentialité/flux métier.

---
*Document généré le 21 Avril 2026 pour l'équipe de développement Lovable.*
