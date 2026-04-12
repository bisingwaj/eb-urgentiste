# Note Lovable — Flux hôpital (étapes 1 à 3)

Document pour l’équipe **Lovable / Supabase** : alignement avec le flux mobile **Étoile Bleue** (portail hôpital).  
Date : avril 2026.

---

## Ce que le mobile implémente déjà

| Étape | Comportement attendu | Implémentation |
|--------|----------------------|----------------|
| **1 — Voir l’alerte** | Patient (nom, âge, sexe, motif, profil médical si `citizen_id`), triage SOS, localisation, **unité terrain** | `HospitalContext` charge `dispatches` + `incidents`, `sos_responses`, profil citoyen, jointure **`units (callsign, phone, vehicle_type, vehicle_plate, agent_name)`**. Écran `HospitalCaseDetailScreen` : sections patient, localisation & unité, SOS, actions terrain. |
| **2 — Accepter / refuser** | Persistance `hospital_status`, motif refus | `updateCaseStatus` met à jour `dispatches.hospital_status`, `hospital_responded_at`, `hospital_notes`. Swipe accepter + modale refus. |
| **3 — Carte temps réel** | Après acceptation, position live de l’unité vers la structure | Affiché si `hospital_status === 'accepted'` **et** `unit_id` présent. GPS via `active_rescuers` + fallback `units`, itinéraire Mapbox vers `assigned_structure_lat/lng`. |

---

## Points à valider ou compléter côté base / dashboard

### Données obligatoires pour une expérience complète

1. **`dispatches.unit_id`**  
   Sans `unit_id`, le mobile **ne peut pas** démarrer le suivi GPS (étape 3). La centrale doit assigner une unité au dispatch **avant** ou **dès** l’orientation hôpital.

2. **`dispatches.assigned_structure_lat` / `assigned_structure_lng`**  
   Renseignées lors de l’assignation de structure. Sinon la carte affiche un bandeau « Coordonnées de la structure indisponibles » et pas d’itinéraire vers l’hôpital.

3. **`units.phone`** (ou équivalent métier)  
   Utilisé comme **contact appel/SMS** pour l’équipe terrain. Si vide, les boutons téléphone affichent une alerte « Contact indisponible ».

4. **`incidents.caller_phone`**  
   Affiché comme « Tél. signalement » pour joindre le patient au besoin.

5. **`incidents.reference`**  
   Affiché dans l’en-tête du détail (traçabilité côté hôpital).

6. **Profil patient (`users_directory` via `citizen_id`)**  
   Allergies, antécédents, etc. Si `citizen_id` est null, seuls les champs incident / SOS sont visibles.

7. **`hospital_data` (JSON sur `dispatches`)** — optionnel  
   Âge / sexe avancés : le mobile déduit l’âge depuis `date_of_birth` du profil si `hospital_data.age` est absent. Pour le sexe, enrichir `hospital_data` ou le profil citoyen si le produit l’exige.

### Sécurité & Realtime (indispensable pour l’étape 3)

- **`active_rescuers`** : publication Realtime + **RLS** permettant au rôle `hopital` de lire les lignes des secouristes rattachés aux dispatches / unités de **sa** structure (voir `HOSPITAL_APP_INTEGRATION.md` §8).
- **`dispatches`** : déjà écouté par le mobile pour rafraîchir la liste après acceptation / changement de statut.

### Cohérence des statuts dispatch

- Le mobile interprète `en_route_hospital` pour l’UI « en route » et le pied de page « Patient arrivé - Admettre ».  
- Lovable : documenter les transitions (`dispatched` → `en_route_hospital` → `arrived_hospital` → …) pour rester alignés avec `HospitalCaseDetailScreen` et `HospitalContext.mapRowToCase`.

---

## Synthèse « checklist » pour Lovable

- [ ] `unit_id` systématique sur les dispatches orientés structure dès que le transport est connu.  
- [ ] `assigned_structure_lat` / `assigned_structure_lng` à jour à l’assignation.  
- [ ] `units.phone`, `vehicle_plate`, `vehicle_type`, `agent_name` maintenus (ou vues métier équivalentes).  
- [ ] `incidents.caller_phone` et `incidents.reference` renseignés quand possible.  
- [ ] Realtime + RLS sur `active_rescuers` pour le rôle hôpital.  
- [ ] (Optionnel) ETA côté backend pour remplacer le placeholder `eta: '5 min'` dans le mapping si vous exposez une durée calculée.

---

*Ce fichier est une note de travail ; le détail d’intégration API reste dans `HOSPITAL_APP_INTEGRATION.md`.*
