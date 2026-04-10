# Prompt Cursor — Application Urgentiste : Workflow complet d'intervention

> **Destinataire :** équipe mobile urgentiste (Cursor / Anti Gravity)  
> **Backend :** Lovable Cloud (Supabase)  
> **Date :** avril 2026  
> **Prérequis :** Application urgentiste Flutter avec Supabase configuré

---

## 0. Flux corrigé (séquence exacte)

```
1. La centrale reçoit un appel SOS et crée un incident
2. La centrale déploie une UNITÉ → dispatch créé (status: dispatched)
3. L'urgentiste reçoit la notification → accepte la mission
4. L'urgentiste se met en route → status: en_route
5. L'urgentiste arrive sur zone → status: on_scene
6. L'urgentiste évalue la victime :
   a. Traitement sur place → status: completed / resolved (FIN)
   b. Évacuation nécessaire → ATTENDRE que la centrale assigne un hôpital
7. ⏳ L'hôpital doit d'abord ACCEPTER (hospital_status = accepted)
8. ✅ L'urgentiste reçoit les coordonnées de l'hôpital SEULEMENT après acceptation
9. L'urgentiste part vers l'hôpital → status: en_route_hospital
10. Arrivée à l'hôpital → status: arrived_hospital → relais à l'hôpital
11. Fin de mission → status: mission_end / completed
```

**IMPORTANT** : L'urgentiste ne doit **JAMAIS** recevoir les coordonnées de l'hôpital tant que `hospital_status != 'accepted'`. Il doit afficher un écran d'attente.

---

## 1. Réception de la mission (Realtime)

### Écouter les dispatches assignés à son unité

```dart
void listenForDispatches(String unitId) {
  supabase
    .channel('dispatch-$unitId')
    .onPostgresChanges(
      event: PostgresChangeEvent.insert,
      schema: 'public',
      table: 'dispatches',
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'unit_id',
        value: unitId,
      ),
      callback: (payload) {
        final dispatch = payload.newRecord;
        // Afficher la notification de nouvelle mission
        _showNewMissionAlert(dispatch);
      },
    )
    .subscribe();
}
```

### Charger les détails de l'incident

```dart
Future<Map<String, dynamic>> loadMissionDetails(String dispatchId) async {
  final res = await supabase
    .from('dispatches')
    .select('''
      id, status, hospital_status, hospital_data,
      assigned_structure_id, assigned_structure_name, assigned_structure_lat, 
      assigned_structure_lng, assigned_structure_phone, assigned_structure_type,
      incidents!inner(
        id, title, reference, caller_name, caller_phone, type, priority,
        location_lat, location_lng, location_address, commune, description
      )
    ''')
    .eq('id', dispatchId)
    .single();
  
  return res;
}
```

---

## 2. Progression des statuts

### Mise à jour simultanée (dispatches + incidents + active_rescuers)

```dart
Future<void> updateMissionStatus(String dispatchId, String incidentId, String newStatus) async {
  // 1. Mettre à jour le dispatch
  final dispatchUpdates = <String, dynamic>{
    'status': newStatus,
    'updated_at': DateTime.now().toIso8601String(),
  };
  if (newStatus == 'on_scene') dispatchUpdates['arrived_at'] = DateTime.now().toIso8601String();
  if (newStatus == 'completed') dispatchUpdates['completed_at'] = DateTime.now().toIso8601String();
  
  await supabase.from('dispatches').update(dispatchUpdates).eq('id', dispatchId);
  
  // 2. Mettre à jour l'incident
  final incidentStatusMap = {
    'en_route': 'en_route',
    'on_scene': 'arrived',
    'en_route_hospital': 'en_route_hospital',
    'arrived_hospital': 'arrived_hospital',
    'mission_end': 'ended',
    'completed': 'resolved',
  };
  final incidentStatus = incidentStatusMap[newStatus];
  if (incidentStatus != null) {
    final incidentUpdates = <String, dynamic>{
      'status': incidentStatus,
      'updated_at': DateTime.now().toIso8601String(),
    };
    if (newStatus == 'completed') incidentUpdates['resolved_at'] = DateTime.now().toIso8601String();
    await supabase.from('incidents').update(incidentUpdates).eq('id', incidentId);
  }
  
  // 3. Mettre à jour active_rescuers
  final rescuerStatusMap = {
    'en_route': 'en_route',
    'on_scene': 'on_scene',
    'en_route_hospital': 'en_route',
    'arrived_hospital': 'on_scene',
    'completed': 'active',
    'mission_end': 'active',
  };
  final rescuerStatus = rescuerStatusMap[newStatus];
  if (rescuerStatus != null) {
    await supabase.from('active_rescuers').update({
      'status': rescuerStatus,
      'updated_at': DateTime.now().toIso8601String(),
    }).eq('user_id', supabase.auth.currentUser!.id);
  }
}
```

---

## 3. Phase "Sur zone" : évaluation de la victime

L'urgentiste a deux choix sur zone :

### A. Traiter sur place → résoudre

```dart
await updateMissionStatus(dispatchId, incidentId, 'completed');
```

### B. Évacuation nécessaire → attendre l'affectation d'un hôpital

L'urgentiste doit **signaler** à la centrale qu'une évacuation est nécessaire. Cela se fait en restant en `on_scene` et en attendant que la centrale assigne un hôpital.

**La centrale va :**
1. Assigner un hôpital → `assigned_structure_*` rempli, `hospital_status = 'pending'`
2. L'hôpital accepte ou refuse → `hospital_status = 'accepted'` ou `'refused'`

---

## 4. Écouter l'affectation et l'acceptation de l'hôpital

### Écouter les mises à jour du dispatch en temps réel

```dart
void listenDispatchUpdates(String dispatchId) {
  supabase
    .channel('dispatch-updates-$dispatchId')
    .onPostgresChanges(
      event: PostgresChangeEvent.update,
      schema: 'public',
      table: 'dispatches',
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'id',
        value: dispatchId,
      ),
      callback: (payload) {
        final row = payload.newRecord;
        
        // Structure assignée mais en attente
        if (row['assigned_structure_id'] != null && row['hospital_status'] == 'pending') {
          setState(() {
            _hospitalPending = true;
            _hospitalName = row['assigned_structure_name'];
          });
          // Afficher : "⏳ En attente de réponse de [Hôpital]..."
        }
        
        // Hôpital a accepté → afficher les coordonnées et lancer la navigation
        if (row['hospital_status'] == 'accepted') {
          setState(() {
            _hospitalAccepted = true;
            _hospitalLat = row['assigned_structure_lat'];
            _hospitalLng = row['assigned_structure_lng'];
            _hospitalName = row['assigned_structure_name'];
            _hospitalPhone = row['assigned_structure_phone'];
            _hospitalAddress = row['assigned_structure_address'];
          });
          // MAINTENANT on peut afficher les coordonnées et lancer la navigation GPS
          _startNavigationToHospital();
        }
        
        // Hôpital a refusé → afficher un message, attendre réassignation
        if (row['hospital_status'] == 'refused') {
          setState(() {
            _hospitalRefused = true;
            _hospitalNotes = row['hospital_notes']; // raison du refus
          });
          // Afficher : "✗ [Hôpital] a refusé. En attente de réassignation..."
        }
      },
    )
    .subscribe();
}
```

---

## 5. En route vers l'hôpital

**SEULEMENT après `hospital_status == 'accepted'`**, l'urgentiste peut passer en `en_route_hospital` :

```dart
Future<void> startRouteToHospital(String dispatchId, String incidentId) async {
  // Vérifier que l'hôpital a bien accepté
  final dispatch = await supabase.from('dispatches').select('hospital_status').eq('id', dispatchId).single();
  if (dispatch['hospital_status'] != 'accepted') {
    showError("L'hôpital n'a pas encore accepté");
    return;
  }
  
  await updateMissionStatus(dispatchId, incidentId, 'en_route_hospital');
  
  // Lancer la navigation GPS vers les coordonnées de l'hôpital
  // Les coordonnées sont dans assigned_structure_lat / assigned_structure_lng
}
```

---

## 6. Arrivée à l'hôpital et passage de relais

```dart
Future<void> arriveAtHospital(String dispatchId, String incidentId) async {
  await updateMissionStatus(dispatchId, incidentId, 'arrived_hospital');
  // L'hôpital prend maintenant le relais via son application
}
```

### Fin de mission

```dart
Future<void> endMission(String dispatchId, String incidentId) async {
  await updateMissionStatus(dispatchId, incidentId, 'completed');
  // L'urgentiste redevient disponible
}
```

---

## 7. GPS : envoi continu de la position

L'urgentiste envoie sa position en continu via `active_rescuers` pour que :
- La **centrale** suive sa position sur le radar
- L'**hôpital** (après acceptation) voie l'unité en route

```dart
Future<void> updatePosition(double lat, double lng, {double? heading, int? battery, double? speed}) async {
  await supabase.from('active_rescuers').upsert({
    'user_id': supabase.auth.currentUser!.id,
    'lat': lat,
    'lng': lng,
    'heading': heading,
    'battery': battery,
    'speed': speed,
    'status': _currentStatus, // active, en_route, on_scene, etc.
    'updated_at': DateTime.now().toIso8601String(),
  }, onConflict: 'user_id');
}
```

---

## 8. Synchronisation des statuts — Tableau complet

| Événement urgentiste | `dispatches.status` | `incidents.status` | `active_rescuers.status` |
|---------------------|---------------------|--------------------|--------------------------| 
| Accepte la mission | `dispatched` | `dispatched` | `en_intervention` |
| En route vers victime | `en_route` | `en_route` | `en_route` |
| Arrivé sur zone | `on_scene` | `arrived` | `on_scene` |
| En route vers hôpital | `en_route_hospital` | `en_route_hospital` | `en_route` |
| Arrivé à l'hôpital | `arrived_hospital` | `arrived_hospital` | `on_scene` |
| Fin de mission | `completed` | `resolved` | `active` |

---

## 9. Tables Supabase concernées

| Table | Usage urgentiste |
|-------|------------------|
| `dispatches` | Lecture + UPDATE (status, hospital_data) |
| `incidents` | Lecture + UPDATE (status) |
| `active_rescuers` | INSERT/UPDATE (position GPS) |
| `units` | Lecture seule (info de son unité) |
| `users_directory` | Lecture seule (son profil) |
| `health_structures` | ❌ **Pas de lecture directe** — les infos hôpital viennent de `dispatches.assigned_structure_*` |

---

## 10. Règles critiques

1. **NE JAMAIS afficher les coordonnées de l'hôpital tant que `hospital_status != 'accepted'`**
2. **NE JAMAIS passer en `en_route_hospital` sans vérifier `hospital_status == 'accepted'`**
3. **Toujours mettre à jour les 3 tables** (dispatches, incidents, active_rescuers) simultanément
4. **Progression forward-only** : ne jamais revenir en arrière dans les statuts
5. **GPS continu** : envoyer la position même en route vers l'hôpital (l'hôpital la suit)

---

## 11. Gestion des cas d'erreur

### Hôpital refuse → attendre réassignation
```dart
// L'urgentiste reste en on_scene
// Il attend que la centrale réassigne un autre hôpital
// Le dispatch sera mis à jour avec un nouveau assigned_structure_*
// et hospital_status repassera à 'pending'
```

### Perte de connexion
```dart
// Sauvegarder l'état localement
// Resyncer à la reconnexion via un fetch du dispatch courant
```

---

*Document contrat Lovable → Cursor (urgentiste). Ne pas renommer les colonnes sans coordination.*
