# Intégration Application Structure / Hôpital — Guide technique

> **Destinataire :** Équipe mobile (Cursor / Flutter) — App `eb-structure`
> **Date :** 2026-04-09
> **Backend :** Supabase (Lovable Cloud)

---

## 1. Architecture du flux Structure

```
Centrale (Dashboard) ──dispatch──▶ Unité terrain (secouriste)
                                         │
                                    soins sur place
                                    triage SOS rempli
                                         │
                          Centrale assigne structure ──▶ dispatch.assigned_structure_id
                                                              │
                                                     ▼
                                              APP STRUCTURE
                                         (voit l'alerte + détails)
                                         (accepte ou refuse)
```

---

## 2. Authentification de la structure

L'app structure utilise le même mécanisme que l'app urgentiste :

```dart
// Connexion via Edge Function agent-login
final response = await supabase.functions.invoke('agent-login', body: {
  'agent_login_id': loginId,  // ex: "837291"
  'pin_code': pinCode,        // ex: "495163"
});
// Retourne un JWT Supabase — utiliser supabase.auth.setSession(...)
```

Le rôle de l'utilisateur est `hopital` dans `users_directory`.

---

## 3. Récupérer les dispatches assignés à ma structure

### 3.1 Identifier ma structure

```dart
// 1. Récupérer mon profil (linked à la structure)
final profile = await supabase
  .from('users_directory')
  .select('id')
  .eq('auth_user_id', supabase.auth.currentUser!.id)
  .single();

// 2. Trouver ma structure
final structure = await supabase
  .from('health_structures')
  .select('id, name, type')
  .eq('linked_user_id', profile['id'])
  .single();

final myStructureId = structure['id'];
```

### 3.2 Charger les dispatches assignés

```dart
final dispatches = await supabase
  .from('dispatches')
  .select('''
    id,
    status,
    hospital_status,
    hospital_notes,
    hospital_responded_at,
    dispatched_at,
    arrived_at,
    completed_at,
    notes,
    assigned_structure_name,
    assigned_structure_type,
    rescuer_id,
    unit_id,
    incidents!inner (
      id,
      reference,
      title,
      description,
      type,
      priority,
      status,
      caller_name,
      caller_phone,
      location_lat,
      location_lng,
      location_address,
      commune,
      citizen_id,
      device_model,
      battery_level,
      network_state,
      media_type,
      media_urls,
      recommended_actions,
      recommended_facility,
      created_at,
      incident_at
    )
  ''')
  .eq('assigned_structure_id', myStructureId)
  .order('dispatched_at', ascending: false);
```

### 3.3 Écouter les nouveaux dispatches en temps réel

```dart
final channel = supabase.channel('hospital-dispatches')
  .onPostgresChanges(
    event: PostgresChangeEvent.all,
    schema: 'public',
    table: 'dispatches',
    filter: PostgresChangeFilter(
      type: PostgresChangeFilterType.eq,
      column: 'assigned_structure_id',
      value: myStructureId,
    ),
    callback: (payload) {
      // Nouveau dispatch ou mise à jour
      // payload.newRecord contient les données
      _refreshDispatches();
    },
  )
  .subscribe();
```

> **Note :** Pour que le realtime fonctionne, la table `dispatches` doit être ajoutée à la publication realtime :
> ```sql
> ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatches;
> ```

---

## 4. Récupérer les détails complets du patient et du triage

### 4.1 Réponses au questionnaire SOS (triage terrain)

La table `sos_responses` contient toutes les réponses collectées par l'urgentiste :

```dart
final triageResponses = await supabase
  .from('sos_responses')
  .select('''
    id,
    question_key,
    question_text,
    answer,
    answers,
    gravity_score,
    gravity_level,
    answered_at,
    created_at
  ''')
  .eq('incident_id', incidentId)
  .order('created_at', ascending: true);
```

**Structure des réponses :**

| Champ | Description |
|-------|-------------|
| `question_key` | Identifiant unique de la question (ex: `conscious`, `breathing`, `bleeding`) |
| `question_text` | Texte de la question posée (ex: "La victime est-elle consciente ?") |
| `answer` | Réponse textuelle simple |
| `answers` | Réponses détaillées au format JSON (pour les questions à choix multiples) |
| `gravity_score` | Score de gravité calculé (0-20) |
| `gravity_level` | Niveau de gravité (`low`, `medium`, `high`, `critical`) |

### 4.2 Informations du citoyen/patient

```dart
// Si citizen_id est disponible dans l'incident
if (incident['citizen_id'] != null) {
  final citizen = await supabase
    .from('users_directory')
    .select('''
      first_name,
      last_name,
      phone,
      date_of_birth,
      blood_type,
      allergies,
      medical_history,
      medications,
      emergency_contact_name,
      emergency_contact_phone
    ''')
    .eq('auth_user_id', incident['citizen_id'])
    .maybeSingle();
}
```

### 4.3 Historique des appels liés

```dart
final callHistory = await supabase
  .from('call_history')
  .select('''
    id,
    call_type,
    status,
    started_at,
    answered_at,
    ended_at,
    duration_seconds,
    caller_name,
    caller_phone,
    has_video,
    notes,
    triage_data
  ''')
  .eq('incident_id', incidentId)
  .order('started_at', ascending: false);
```

### 4.4 Données du dispatch terrain (soins de l'unité)

```dart
// Le champ 'notes' du dispatch contient les observations du secouriste
// Le champ 'recommended_actions' de l'incident contient les actions recommandées
// Le champ 'recommended_facility' de l'incident contient la structure recommandée

final dispatchDetails = {
  'field_notes': dispatch['notes'],                          // Notes du secouriste
  'recommended_actions': incident['recommended_actions'],    // Actions recommandées
  'recommended_facility': incident['recommended_facility'],  // Structure recommandée
  'incident_type': incident['type'],                         // Type d'urgence
  'priority': incident['priority'],                          // Priorité (critical/high/medium/low)
  'description': incident['description'],                    // Description de l'urgence
};
```

---

## 5. Accepter ou refuser l'alerte

### 5.1 Accepter

```dart
Future<void> acceptDispatch(String dispatchId) async {
  await supabase
    .from('dispatches')
    .update({
      'hospital_status': 'accepted',
      'hospital_responded_at': DateTime.now().toUtc().toIso8601String(),
      'hospital_notes': 'Patient attendu — préparation en cours',
    })
    .eq('id', dispatchId);
}
```

### 5.2 Refuser (avec motif obligatoire)

```dart
Future<void> refuseDispatch(String dispatchId, String motif) async {
  await supabase
    .from('dispatches')
    .update({
      'hospital_status': 'refused',
      'hospital_responded_at': DateTime.now().toUtc().toIso8601String(),
      'hospital_notes': motif, // ex: "Capacité maximale atteinte", "Pas de service spécialisé"
    })
    .eq('id', dispatchId);
}
```

### 5.3 Valeurs possibles de `hospital_status`

| Valeur | Description |
|--------|-------------|
| `pending` | Alerte reçue, en attente de réponse (défaut) |
| `accepted` | Structure a accepté de recevoir le patient |
| `refused` | Structure a refusé (motif dans `hospital_notes`) |

---

## 6. Écran de détails recommandé (maquette)

```
┌─────────────────────────────────────────────┐
│  🚨 Alerte urgente — SOS-1775536259127      │
│  Priorité : 🔴 CRITIQUE                     │
│  Type : Accident de la route                │
│  Reçu le : 09/04/2026 à 14:32              │
├─────────────────────────────────────────────┤
│                                             │
│  👤 PATIENT                                 │
│  Nom : Jean Mukendi                         │
│  Téléphone : +243 812 345 678               │
│  Âge : 34 ans                               │
│  Groupe sanguin : O+                        │
│  Allergies : Pénicilline                    │
│  Antécédents : Diabète type 2               │
│  Contact urgence : Marie Mukendi            │
│  Tél. urgence : +243 998 765 432            │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  📋 TRIAGE TERRAIN (Questionnaire SOS)      │
│  ─────────────────────────────────────────  │
│  ✓ Victime consciente ? → Oui              │
│  ✓ Respiration normale ? → Non             │
│  ✓ Hémorragie visible ? → Oui, abondante   │
│  ✓ Fractures suspectées ? → Membre inf.    │
│  ✓ Traitement sur place ? → Oui            │
│    - Compression hémostatique               │
│    - Attelle improvisée                     │
│    - Oxygène administré                     │
│  Score gravité : 14/20 (CRITIQUE)           │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  🚑 ACTIONS TERRAIN                         │
│  Notes secouriste : Hémorragie contrôlée,   │
│  patient stabilisé, fracture ouverte tibia  │
│  droit. Transport urgent recommandé.        │
│  Actions recommandées : Chirurgie ortho     │
│  Structure recommandée : Hôpital Mama Yemo  │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  📍 LOCALISATION                            │
│  Adresse : Commune de Lemba, Kinshasa       │
│  GPS : -4.3478, 15.3125                     │
│  [    Voir sur la carte    ]                │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│  [  ✅ ACCEPTER  ]    [  ❌ REFUSER  ]      │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 7. Notification à la centrale

Quand l'hôpital accepte ou refuse, la centrale est notifiée en temps réel via le listener Realtime déjà en place sur `dispatches`. Le dashboard affiche le `hospital_status` dans le panneau de dispatch.

### Côté Dashboard (déjà géré automatiquement)

Le dashboard écoute les changements sur `dispatches` en temps réel. Quand `hospital_status` passe à `accepted` ou `refused`, l'opérateur le voit immédiatement.

---

## 8. Sécurité (RLS)

Les politiques suivantes sont déjà configurées :

| Action | Autorisé pour `hopital` |
|--------|------------------------|
| **SELECT dispatches** | ✅ Tous les authentifiés (politique existante) |
| **UPDATE dispatches** | ✅ Seulement si `assigned_structure_id` correspond à ma structure |
| **SELECT sos_responses** | ✅ Seulement pour les incidents liés à mes dispatches |
| **INSERT sos_responses** | ✅ Seulement pour les incidents liés à mes dispatches |
| **SELECT call_history** | ✅ Seulement pour les incidents liés à mes dispatches |
| **SELECT users_directory** | ✅ Les rôles `hopital` peuvent voir les profils (politique existante) |

> **Important :** L'hôpital ne peut modifier QUE `hospital_status`, `hospital_notes` et `hospital_responded_at`. Les autres champs du dispatch sont protégés par la logique applicative.

---

## 9. Tables et colonnes clés

### `dispatches` (colonnes ajoutées)
```sql
hospital_status       TEXT DEFAULT 'pending'   -- pending | accepted | refused
hospital_responded_at TIMESTAMPTZ             -- quand l'hôpital a répondu
hospital_notes        TEXT                     -- motif de refus ou commentaires
```

### `sos_responses` (existante — lecture seule pour l'hôpital)
```sql
incident_id     UUID      -- lien avec l'incident
question_key    TEXT      -- identifiant de la question
question_text   TEXT      -- texte de la question
answer          TEXT      -- réponse textuelle
answers         JSONB     -- réponses détaillées (choix multiples)
gravity_score   INTEGER   -- score de gravité (0-20)
gravity_level   TEXT      -- low | medium | high | critical
```

### `incidents` (existante — via jointure dispatches)
```sql
caller_name           TEXT    -- Nom du patient
caller_phone          TEXT    -- Téléphone
citizen_id            UUID    -- ID auth du citoyen (pour récupérer profil médical)
recommended_actions   TEXT    -- Actions recommandées par l'opérateur
recommended_facility  TEXT    -- Structure recommandée
description           TEXT    -- Description de l'urgence
priority              ENUM    -- critical | high | medium | low
type                  TEXT    -- Type d'urgence
location_lat/lng      FLOAT   -- Coordonnées GPS
```

### `users_directory` (existante — profil médical du patient)
```sql
blood_type                TEXT      -- Groupe sanguin
allergies                 TEXT[]    -- Liste d'allergies
medical_history           TEXT[]    -- Antécédents médicaux
medications               TEXT[]    -- Médicaments en cours
emergency_contact_name    TEXT      -- Contact d'urgence
emergency_contact_phone   TEXT      -- Téléphone contact d'urgence
date_of_birth             TEXT      -- Date de naissance
```

---

## 10. Checklist d'implémentation

- [ ] Écran de connexion (agent-login avec ID + PIN)
- [ ] Liste des dispatches assignés (filtrés par `assigned_structure_id`)
- [ ] Listener Realtime pour nouveaux dispatches
- [ ] Écran de détails avec toutes les sections (patient, triage, actions terrain, localisation)
- [ ] Boutons Accepter / Refuser avec `hospital_status` UPDATE
- [ ] Modale de motif pour le refus (texte obligatoire)
- [ ] Notification sonore/vibration à la réception d'un nouveau dispatch
- [ ] Carte intégrée pour visualiser la position du patient
- [ ] Appel VoIP vers le patient (via `rescuer-call-citizen` si applicable)
- [ ] Badge compteur des alertes en attente (`hospital_status = 'pending'`)

---

*Document généré pour intégration mobile — Adapter les noms de variables au style Dart/Flutter du projet.*
