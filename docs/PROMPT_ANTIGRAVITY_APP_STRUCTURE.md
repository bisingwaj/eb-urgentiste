# Prompt pour Anti Gravity — Implémentation App Structure (Hôpital)

> **Contexte :** Application Flutter `eb-structure` connectée au backend Supabase (Lovable Cloud).
> **Objectif :** Permettre aux structures sanitaires (hôpitaux, centres de santé) de recevoir des alertes d'urgence, voir les détails complets du patient et du triage terrain, accepter/refuser les alertes, et suivre en temps réel l'ambulance qui transporte le patient.

---

## 1. Authentification (DÉJÀ IMPLÉMENTÉ — à vérifier)

L'app utilise l'Edge Function `agent-login` avec `agent_login_id` + `pin_code` (6 chiffres).
La réponse inclut un objet `structure` pour le rôle `hopital`.

```dart
final response = await supabase.functions.invoke('agent-login', body: {
  'agent_login_id': loginId,
  'pin_code': pinCode,
});
// Réponse : { token, user, profile, structure: { id, name, type, ... } }
// Stocker structure.id comme myStructureId pour toutes les requêtes
```

---

## 2. Écran principal — Liste des alertes

### 2.1 Charger les dispatches assignés à ma structure

```dart
final dispatches = await supabase
  .from('dispatches')
  .select('''
    id, status, hospital_status, hospital_notes, hospital_responded_at,
    dispatched_at, arrived_at, completed_at, notes, unit_id,
    assigned_structure_name, assigned_structure_type, rescuer_id,
    incidents!inner (
      id, reference, title, description, type, priority, status,
      caller_name, caller_phone, location_lat, location_lng,
      location_address, commune, citizen_id, device_model,
      battery_level, network_state, recommended_actions,
      recommended_facility, created_at, incident_at
    )
  ''')
  .eq('assigned_structure_id', myStructureId)
  .order('dispatched_at', ascending: false);
```

### 2.2 Écouter les nouvelles alertes en temps réel

```dart
supabase.channel('hospital-dispatches')
  .onPostgresChanges(
    event: PostgresChangeEvent.all,
    schema: 'public',
    table: 'dispatches',
    filter: PostgresChangeFilter(
      type: PostgresChangeFilterType.eq,
      column: 'assigned_structure_id',
      value: myStructureId,
    ),
    callback: (payload) => _refreshDispatches(),
  )
  .subscribe();
```

### 2.3 Affichage de la liste

Chaque carte d'alerte affiche :
- **Priorité** (badge couleur : 🔴 critical, 🟠 high, 🟡 medium, 🟢 low)
- **Référence** (ex: SOS-1775536259127)
- **Type** d'urgence (ex: Accident, Malaise, Agression)
- **Heure de réception**
- **Statut hospital_status** :
  - `pending` → Badge jaune "En attente de réponse" + boutons Accepter/Refuser
  - `accepted` → Badge vert "Accepté"
  - `refused` → Badge rouge "Refusé"

---

## 3. Écran détails — Dossier complet du patient

Quand l'utilisateur tape sur une alerte, afficher un écran avec les sections suivantes :

### 3.1 Informations du patient

```dart
// Si incident.citizen_id existe :
final citizen = await supabase
  .from('users_directory')
  .select('''
    first_name, last_name, phone, date_of_birth,
    blood_type, allergies, medical_history, medications,
    emergency_contact_name, emergency_contact_phone
  ''')
  .eq('auth_user_id', incident['citizen_id'])
  .maybeSingle();
```

Afficher :
- Nom complet, téléphone, âge (calculé depuis date_of_birth)
- Groupe sanguin, allergies (liste chips), antécédents médicaux
- Médicaments en cours
- Contact d'urgence (nom + téléphone avec bouton appel)

### 3.2 Triage terrain (questionnaire SOS)

```dart
final triage = await supabase
  .from('sos_responses')
  .select('question_key, question_text, answer, answers, gravity_score, gravity_level, answered_at')
  .eq('incident_id', incidentId)
  .order('created_at', ascending: true);
```

Afficher chaque réponse sous forme de checklist :
- ✓ Question → Réponse
- En bas : **Score de gravité** (ex: 14/20) avec badge couleur selon `gravity_level`

### 3.3 Notes terrain du secouriste

Afficher depuis le dispatch et l'incident :
- `dispatch.notes` → "Notes du secouriste sur le terrain"
- `incident.recommended_actions` → "Actions recommandées"
- `incident.recommended_facility` → "Structure recommandée"
- `incident.description` → "Description de l'urgence"

### 3.4 Historique des appels

```dart
final calls = await supabase
  .from('call_history')
  .select('call_type, status, started_at, duration_seconds, caller_name, notes, triage_data')
  .eq('incident_id', incidentId)
  .order('started_at', ascending: false);
```

---

## 4. Actions — Accepter / Refuser

### 4.1 Accepter l'alerte

```dart
await supabase.from('dispatches').update({
  'hospital_status': 'accepted',
  'hospital_responded_at': DateTime.now().toUtc().toIso8601String(),
  'hospital_notes': 'Patient attendu',
}).eq('id', dispatchId);
```

Après acceptation → naviguer vers l'écran de suivi GPS (section 5).

### 4.2 Refuser l'alerte (motif obligatoire)

Afficher un dialog avec champ texte pour le motif :

```dart
await supabase.from('dispatches').update({
  'hospital_status': 'refused',
  'hospital_responded_at': DateTime.now().toUtc().toIso8601String(),
  'hospital_notes': motif, // obligatoire
}).eq('id', dispatchId);
```

---

## 5. Suivi GPS temps réel de l'ambulance 🗺️

**C'est la feature clé.** Une fois l'alerte acceptée, l'hôpital doit voir l'ambulance se déplacer sur une carte en temps réel.

### 5.1 Récupérer les secouristes de l'unité

```dart
// Trouver les auth_user_id des secouristes rattachés à l'unité
final rescuerProfiles = await supabase
  .from('users_directory')
  .select('auth_user_id')
  .eq('assigned_unit_id', dispatch['unit_id']);

final rescuerIds = rescuerProfiles.map((r) => r['auth_user_id'] as String).toList();
```

### 5.2 Position initiale de l'unité

```dart
final unit = await supabase
  .from('units')
  .select('''
    id, callsign, type, vehicle_type, vehicle_plate,
    location_lat, location_lng, heading, battery, status,
    last_location_update, agent_name
  ''')
  .eq('id', dispatch['unit_id'])
  .single();
```

### 5.3 Position GPS précise du secouriste

```dart
final rescuers = await supabase
  .from('active_rescuers')
  .select('user_id, lat, lng, accuracy, heading, speed, battery, updated_at')
  .in_('user_id', rescuerIds)
  .gte('updated_at', DateTime.now().subtract(Duration(minutes: 5)).toUtc().toIso8601String());
```

### 5.4 Écouter les mises à jour GPS en temps réel

```dart
final gpsChannel = supabase.channel('hospital-unit-tracking')
  .onPostgresChanges(
    event: PostgresChangeEvent.update,
    schema: 'public',
    table: 'active_rescuers',
    callback: (payload) {
      final data = payload.newRecord;
      if (rescuerIds.contains(data['user_id'])) {
        // Mettre à jour le marqueur ambulance sur la carte
        setState(() {
          ambulanceLat = data['lat'] as double;
          ambulanceLng = data['lng'] as double;
          ambulanceHeading = data['heading'] as double?;
          ambulanceSpeed = data['speed'] as double?;
          ambulanceBattery = data['battery'] as int?;
          lastUpdate = DateTime.parse(data['updated_at']);
        });
      }
    },
  )
  .subscribe();
```

### 5.5 Écran de suivi — Layout recommandé

```
┌─────────────────────────────────────────────┐
│  ← Retour        SUIVI AMBULANCE    🔄     │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │         CARTE (Google Maps /         │   │
│  │         Mapbox / OpenStreet)         │   │
│  │                                      │   │
│  │    🚑 marqueur ambulance animé       │   │
│  │     (rotation selon heading)         │   │
│  │                                      │   │
│  │    🏥 marqueur structure (fixe)      │   │
│  │                                      │   │
│  │    --- ligne pointillée route ---    │   │
│  │                                      │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │ 🚑 AMB-KIN-001 — Toyota Hiace       │   │
│  │ Agent : Jean Kabongo                 │   │
│  │ Vitesse : 45 km/h  |  🔋 72%        │   │
│  │ MàJ : il y a 3s    |  📡 Précis     │   │
│  │                                      │   │
│  │ ETA estimé : ~8 min                  │   │
│  │ Statut : 🟢 En route vers hôpital   │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │ 👤 Patient : Jean Mukendi            │   │
│  │ Priorité : 🔴 CRITIQUE              │   │
│  │ Gravité : 14/20                      │   │
│  └──────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

**Points UX importants :**
- Le marqueur ambulance doit **tourner** selon le `heading` (direction)
- Animer le déplacement du marqueur (interpolation fluide entre les positions)
- Afficher "il y a X secondes" pour la dernière mise à jour
- Si `updated_at` > 2 minutes → afficher badge "Signal perdu" en rouge
- Si `battery` < 20% → afficher avertissement batterie faible
- Centrer la carte pour voir les deux points (ambulance + structure)

---

## 6. Notifications push (optionnel mais recommandé)

Quand un nouveau dispatch est assigné à la structure, déclencher une notification locale ou push :

```dart
// Dans le callback realtime des dispatches
if (payload.eventType == PostgresChangeEvent.insert) {
  _showLocalNotification(
    title: '🚨 Nouvelle urgence',
    body: 'Patient en route — ${incident['type']} — Priorité ${incident['priority']}',
  );
  // Jouer un son d'alerte
  _playAlertSound();
}
```

---

## 7. Résumé des tables et accès RLS

| Table | Accès | Usage |
|-------|-------|-------|
| `dispatches` | SELECT tous les siens + UPDATE `hospital_status/notes/responded_at` | Liste des alertes + réponse |
| `incidents` | SELECT via dispatch | Détails de l'urgence |
| `sos_responses` | SELECT via incident | Triage terrain |
| `call_history` | SELECT via incident | Historique appels |
| `users_directory` | SELECT via citizen_id | Profil patient |
| `units` | SELECT unités de ses dispatches actifs | Position initiale ambulance |
| `active_rescuers` | SELECT secouristes de ses unités | GPS temps réel |

**Sécurité :** L'accès GPS est automatiquement révoqué quand le dispatch passe en `completed` ou `cancelled`.

---

## 8. Checklist d'implémentation

- [ ] Écran login (agent-login + stockage myStructureId)
- [ ] Écran liste des alertes (dispatches + realtime)
- [ ] Écran détails patient (citizen + triage + notes terrain + appels)
- [ ] Boutons Accepter / Refuser avec mise à jour hospital_status
- [ ] Écran carte suivi GPS (marqueur ambulance animé + infos unité)
- [ ] Realtime GPS via active_rescuers
- [ ] Notification son/vibration à la réception d'une nouvelle alerte
- [ ] Gestion état "Signal perdu" si GPS > 2 min sans mise à jour
- [ ] Badge batterie faible si < 20%
- [ ] Cleanup des channels realtime au dispose()

