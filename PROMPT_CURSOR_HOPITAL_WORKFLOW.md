# Prompt Cursor — Application Hôpital : Workflow complet d'acceptation et prise en charge

> **Destinataire :** équipe mobile hôpital (Cursor / Anti Gravity)  
> **Backend :** Lovable Cloud (Supabase)  
> **Date :** avril 2026  
> **Prérequis :** Application hôpital Flutter avec Supabase configuré

---

## 0. Flux corrigé (séquence exacte)

```
1. Victime appelle la centrale (SOS)
2. Centrale reçoit l'appel, affecte une UNITÉ au dispatch
3. Unité arrive sur zone, évalue la victime
4. Si évacuation nécessaire → Centrale assigne un HÔPITAL
5. ⏳ L'hôpital reçoit l'alerte → doit ACCEPTER ou REFUSER
6. ✅ Si accepté → l'unité reçoit les infos de l'hôpital, part en route
7. L'hôpital voit la localisation LIVE de l'unité en route
8. L'unité arrive → l'hôpital prend le relais (admission → PEC → clôture)
```

**IMPORTANT** : L'unité ne reçoit **JAMAIS** les coordonnées de l'hôpital tant que l'hôpital n'a pas accepté. Le `hospital_status` reste `pending` jusqu'à la réponse.

---

## 1. Réception de l'alerte (écoute Realtime)

L'hôpital doit écouter les nouveaux dispatches assignés à sa structure en temps réel.

### Identifier sa propre structure

```dart
Future<String?> getMyStructureId() async {
  final userId = supabase.auth.currentUser?.id;
  if (userId == null) return null;
  
  // Récupérer le users_directory pour l'utilisateur courant
  final ud = await supabase
    .from('users_directory')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle();
  
  if (ud == null) return null;
  
  // Trouver la structure liée
  final hs = await supabase
    .from('health_structures')
    .select('id')
    .eq('linked_user_id', ud['id'])
    .maybeSingle();
  
  return hs?['id'];
}
```

### Écouter les dispatches entrants

```dart
void listenForIncomingDispatches(String structureId) {
  supabase
    .channel('hospital-incoming-$structureId')
    .onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'dispatches',
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'assigned_structure_id',
        value: structureId,
      ),
      callback: (payload) {
        final row = payload.newRecord;
        final status = row['hospital_status'];
        
        if (status == 'pending') {
          // ⚠️ NOUVELLE ALERTE — Afficher l'écran d'acceptation/refus
          _showIncomingAlert(row);
        }
      },
    )
    .subscribe();
}
```

---

## 2. Accepter ou refuser l'alerte

### Accepter

```dart
Future<void> acceptDispatch(String dispatchId) async {
  await supabase.from('dispatches').update({
    'hospital_status': 'accepted',
    'hospital_responded_at': DateTime.now().toIso8601String(),
    'hospital_notes': 'Accepté par l\'hôpital',
  }).eq('id', dispatchId);
}
```

### Refuser

```dart
Future<void> refuseDispatch(String dispatchId, String reason) async {
  await supabase.from('dispatches').update({
    'hospital_status': 'refused',
    'hospital_responded_at': DateTime.now().toIso8601String(),
    'hospital_notes': reason, // ex: "Pas de lits disponibles"
  }).eq('id', dispatchId);
}
```

**Conséquence côté centrale :**
- Si `accepted` → le dashboard affiche ✓ et débloque le bouton "En route vers l'hôpital"
- Si `refused` → le dashboard affiche ✗ et l'opérateur doit réassigner une autre structure

---

## 3. Suivi de l'unité en temps réel (après acceptation)

**SEULEMENT après avoir accepté**, l'hôpital doit afficher la position de l'unité en route.

### Récupérer l'unité rattachée au dispatch

```dart
Future<Map<String, dynamic>?> getDispatchUnit(String dispatchId) async {
  final dispatch = await supabase
    .from('dispatches')
    .select('unit_id, units(id, callsign, type, location_lat, location_lng, heading, battery, last_location_update)')
    .eq('id', dispatchId)
    .single();
  
  return dispatch['units'];
}
```

### Écouter la position live de l'unité

```dart
void listenUnitPosition(String unitUserId) {
  supabase
    .channel('unit-tracking-$unitUserId')
    .onPostgresChanges(
      event: PostgresChangeEvent.update,
      schema: 'public',
      table: 'active_rescuers',
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'user_id',
        value: unitUserId,
      ),
      callback: (payload) {
        final row = payload.newRecord;
        // Mettre à jour la carte en temps réel
        updateMapMarker(
          lat: row['lat'],
          lng: row['lng'],
          heading: row['heading'],
          battery: row['battery'],
          speed: row['speed'],
        );
      },
    )
    .subscribe();
}
```

### Pour trouver le `user_id` de l'urgentiste rattaché à l'unité

```dart
Future<String?> getRescuerUserId(String unitId) async {
  final res = await supabase
    .from('users_directory')
    .select('auth_user_id, first_name, last_name, phone')
    .eq('assigned_unit_id', unitId)
    .maybeSingle();
  
  return res?['auth_user_id'];
}
```

---

## 4. Admission du patient

Quand l'unité arrive à l'hôpital, l'hôpital valide l'admission avec les 3 champs obligatoires.

```dart
Future<void> recordAdmission(String dispatchId, {
  required String arrivalMode,   // AMBULANCE, SMUR, MOTO, PERSONNEL
  required String arrivalState,  // stable, critique, inconscient
  required String admissionService, // urgence_generale, trauma, pediatrie
}) async {
  await mergeHospitalData(dispatchId, {
    'status': 'admis',
    'arrivalMode': arrivalMode,
    'arrivalState': arrivalState,
    'admissionService': admissionService,
    'arrivalTime': '${DateTime.now().hour.toString().padLeft(2, '0')}:${DateTime.now().minute.toString().padLeft(2, '0')}',
  });
  
  await supabase.from('dispatches').update({
    'status': 'arrived_hospital',
    'arrived_at': DateTime.now().toIso8601String(),
    'admission_recorded_at': DateTime.now().toIso8601String(),
    'admission_recorded_by': supabase.auth.currentUser?.id,
  }).eq('id', dispatchId);
}
```

### Valeurs autorisées

| Champ | Valeurs |
|-------|---------|
| `arrivalMode` | `AMBULANCE`, `SMUR`, `MOTO`, `PERSONNEL` |
| `arrivalState` | `stable`, `critique`, `inconscient` |
| `admissionService` | `urgence_generale`, `trauma`, `pediatrie` |

---

## 5. Triage

```dart
await mergeHospitalData(dispatchId, {
  'status': 'triage',
  'triageLevel': 'orange', // rouge, orange, jaune, vert
  'symptoms': ['douleur thoracique', 'dyspnée'],
  'provisionalDiagnosis': 'Suspicion SCA',
  'triageNotes': 'Patient conscient, Glasgow 15',
  'triageRecordedAt': DateTime.now().toIso8601String(),
  'vitals': {
    'bloodPressure': '140/90',  // facultatif
    'heartRate': 88,             // facultatif
    'temperature': 37.5,         // facultatif
    'spO2': 96,                  // facultatif
    'respiratoryRate': 20,       // facultatif
    'glasgowScore': 15,          // facultatif
    'painScore': 7,              // facultatif (0-10)
    'weight': 70,                // facultatif (kg)
  },
});
```

---

## 6. Prise en charge (PEC)

```dart
await mergeHospitalData(dispatchId, {
  'status': 'prise_en_charge',
  'treatment': 'Paracétamol 1g IV, ECG, Monitoring cardiaque',
  'notes': 'Patient sous surveillance continue',
  'observations': [
    {'id': 'obs-1', 'time': '14:55', 'text': 'Douleur diminuée', 'status': 'Amélioration'},
  ],
  'exams': [
    {'id': 'exam-1', 'label': 'ECG', 'status': 'done', 'result': 'Normal'},
  ],
  'treatments': [
    {'id': 'tx-1', 'label': 'Paracétamol 1g', 'route': 'IV', 'time': '14:40'},
  ],
  'timeline': [
    {'id': 'tl-1', 'time': '14:32', 'action': 'Admission', 'type': 'status'},
    {'id': 'tl-2', 'time': '14:45', 'action': 'Triage orange', 'type': 'action'},
    {'id': 'tl-3', 'time': '14:50', 'action': 'ECG réalisé', 'type': 'test'},
  ],
});
```

### Ajout incrémental (observations, exams, etc.)

Pour ajouter un élément sans écraser les existants :

```dart
Future<void> addObservation(String dispatchId, Map<String, dynamic> obs) async {
  final res = await supabase.from('dispatches').select('hospital_data').eq('id', dispatchId).single();
  final existing = (res['hospital_data'] as Map<String, dynamic>?) ?? {};
  final observations = List<Map<String, dynamic>>.from(existing['observations'] ?? []);
  observations.add(obs);
  await mergeHospitalData(dispatchId, {'observations': observations});
}
```

---

## 7. Monitoring

```dart
await mergeHospitalData(dispatchId, {
  'status': 'monitoring',
  'monitoringStatus': 'stable', // amelioration, stable, degradation
  'monitoringNotes': 'Patient stable sous monitoring',
  // Si transfert nécessaire :
  // 'transferTarget': 'CHU de Kinshasa',
});
```

---

## 8. Clôture et rapport final

```dart
Future<void> closeCase(String dispatchId, String incidentId, String structureId) async {
  // 1. Écrire la clôture dans hospital_data
  await mergeHospitalData(dispatchId, {
    'status': 'termine',
    'dischargeType': 'guerison', // guerison, transfert, deces, sortie_contre_avis
    'dischargeNotes': 'Patient stable, sortie autorisée',
    'dischargedAt': DateTime.now().toIso8601String(),
  });
  
  // 2. Fermer le dispatch
  await supabase.from('dispatches').update({
    'status': 'completed',
    'completed_at': DateTime.now().toIso8601String(),
  }).eq('id', dispatchId);
  
  // 3. Envoyer le rapport final
  await supabase.from('hospital_reports').insert({
    'dispatch_id': dispatchId,
    'incident_id': incidentId,
    'structure_id': structureId,
    'report_data': buildFullReportPayload(), // JSON complet
    'summary': 'Patient traité et sorti guéri',
    'sent_by': supabase.auth.currentUser?.id,
    'sent_at': DateTime.now().toIso8601String(),
  });
  
  // 4. Marquer le rapport comme envoyé
  await mergeHospitalData(dispatchId, {
    'reportSent': true,
    'reportSentAt': DateTime.now().toIso8601String(),
  });
}
```

---

## 9. Signalement de contraintes

```dart
Future<void> reportConstraint(String structureId, String type, String severity, String description) async {
  await supabase.from('hospital_constraints').insert({
    'structure_id': structureId,
    'constraint_type': type,     // lits, personnel, equipement, medicaments, surcharge, autre
    'severity': severity,        // low, medium, high, critical
    'description': description,
    'reported_by': supabase.auth.currentUser?.id,
  });
}
```

---

## 10. Historique des interventions

```dart
Future<List<Map<String, dynamic>>> fetchHistory(String structureId) async {
  final res = await supabase
    .from('dispatches')
    .select('''
      id, status, created_at, completed_at, hospital_data, hospital_status,
      incidents!inner(id, title, reference, caller_name, caller_phone, type, priority, commune, created_at),
      units(id, callsign, type)
    ''')
    .eq('assigned_structure_id', structureId)
    .inFilter('status', ['completed', 'cancelled', 'arrived_hospital', 'mission_end'])
    .order('created_at', ascending: false)
    .limit(100);
  
  return List<Map<String, dynamic>>.from(res);
}
```

### KPIs

```dart
final totalCases = history.where((h) => h['status'] == 'completed').length;
final guerisons = history.where((h) => h['hospital_data']?['dischargeType'] == 'guerison').length;
final tauxGuerison = totalCases > 0 ? (guerisons / totalCases * 100).round() : 0;
```

---

## 11. Règle absolue : FUSIONNER, jamais remplacer

```dart
Future<void> mergeHospitalData(String dispatchId, Map<String, dynamic> newFields) async {
  final res = await supabase
    .from('dispatches')
    .select('hospital_data')
    .eq('id', dispatchId)
    .single();
  
  final existing = (res['hospital_data'] as Map<String, dynamic>?) ?? {};
  final merged = <String, dynamic>{...existing, ...newFields};
  
  await supabase.from('dispatches').update({
    'hospital_data': merged,
    'updated_at': DateTime.now().toIso8601String(),
  }).eq('id', dispatchId);
}
```

---

## 12. Synchronisation des statuts — Tableau complet

| Événement hôpital | `hospital_data.status` | `dispatches.status` | `dispatches.hospital_status` |
|-------------------|------------------------|---------------------|-----------------------------|
| Réception alerte | — | *(inchangé)* | `pending` |
| **Accepte** l'alerte | — | *(inchangé)* | `accepted` |
| **Refuse** l'alerte | — | *(inchangé)* | `refused` |
| Admission validée | `admis` | `arrived_hospital` | *(inchangé)* |
| Triage | `triage` | *(inchangé)* | *(inchangé)* |
| PEC démarrée | `prise_en_charge` | *(inchangé)* | *(inchangé)* |
| Monitoring | `monitoring` | *(inchangé)* | *(inchangé)* |
| Clôture | `termine` | `completed` | *(inchangé)* |

---

## 13. Tables Supabase concernées

| Table | Usage hôpital |
|-------|---------------|
| `dispatches` | Lecture/UPDATE (hospital_data, hospital_status) |
| `incidents` | Lecture seule (infos urgence) |
| `units` | Lecture seule (info unité) |
| `active_rescuers` | Lecture seule Realtime (position GPS de l'unité) |
| `health_structures` | Lecture seule (sa propre fiche) |
| `users_directory` | Lecture seule (téléphone urgentiste) |
| `hospital_reports` | INSERT (rapport final) |
| `hospital_constraints` | INSERT/UPDATE (contraintes ressources) |

---

*Document contrat Lovable → Cursor (hôpital). Ne pas renommer les clés JSON sans coordination.*
