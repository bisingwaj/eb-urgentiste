# Prompt Cursor — Intégration complète portail hôpital (bout en bout)

> **Destinataire :** équipe mobile (Cursor / Anti Gravity)  
> **Backend :** Lovable Cloud (Supabase)  
> **Date :** avril 2026  
> **Prérequis :** `PROMPT_CURSOR_INTEGRATION_HOSPITAL_DATA.md` + `PROMPT_CURSOR_HOSPITAL_PEC_MONITORING.md` déjà intégrés

---

## 0. Résumé des changements backend (ce qui vient d'être fait)

### Nouvelles tables

| Table | Description |
|-------|-------------|
| `hospital_reports` | Stocke le rapport clinique final envoyé par l'hôpital à la clôture |
| `hospital_constraints` | Stocke les signalements de contraintes (lits, personnel, équipement) |

Les deux tables sont **en temps réel** (Supabase Realtime activé).

### Dashboard enrichi

Le dashboard central affiche désormais **toutes les données** de `hospital_data` :
- ✅ Admission (mode, état, service, heure)
- ✅ Triage (niveau, **symptômes**, **diagnostic provisoire**, **notes triage**, horodatage)
- ✅ Constantes vitales (TA, FC, T°, SpO₂, FR, Glasgow, **douleur**, **poids**)
- ✅ PEC (observations, examens, traitements, timeline)
- ✅ Monitoring (statut, notes, transfert)
- ✅ **Clôture** (type sortie, notes sortie, date)

---

## 1. Envoi du rapport final à la centrale

### Problème actuel
`HospitalReportScreen` affiche une alerte de succès factice. Aucune persistance.

### Solution : table `hospital_reports`

**Schéma :**

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | `uuid` | PK auto |
| `dispatch_id` | `uuid` | FK → dispatches (obligatoire) |
| `incident_id` | `uuid` | FK → incidents (optionnel) |
| `structure_id` | `uuid` | FK → health_structures (obligatoire) |
| `report_data` | `jsonb` | Contenu complet du rapport |
| `summary` | `text` | Résumé texte libre |
| `sent_by` | `uuid` | auth.uid() de l'envoyeur |
| `sent_at` | `timestamptz` | Horodatage d'envoi |

**RLS :** l'hôpital ne peut insérer que pour ses propres dispatches (via `assigned_structure_id`).

### Payload `report_data` attendu

```json
{
  "patientName": "Jean Mukendi",
  "patientAge": 45,
  "patientPhone": "+243...",
  "admissionDate": "2026-04-09T14:32:00Z",
  "dischargeDate": "2026-04-09T18:45:00Z",
  "triageLevel": "orange",
  "provisionalDiagnosis": "Suspicion infarctus",
  "finalDiagnosis": "Angine de poitrine",
  "treatmentsSummary": "Paracétamol 1g IV, ECG, Monitoring 2h",
  "outcomeType": "guerison",
  "outcomeNotes": "Patient stable, sortie autorisée",
  "vitalsOnAdmission": { "bloodPressure": "140/90", "heartRate": 88, "spO2": 96 },
  "vitalsOnDischarge": { "bloodPressure": "120/80", "heartRate": 72, "spO2": 98 },
  "timeline": [
    { "time": "14:32", "action": "Admission", "type": "status" },
    { "time": "14:45", "action": "Triage START orange", "type": "action" },
    { "time": "15:10", "action": "ECG réalisé", "type": "test" },
    { "time": "18:45", "action": "Sortie autorisée", "type": "status" }
  ]
}
```

### Code Dart à implémenter

```dart
Future<void> sendReportToHQ(String dispatchId, String incidentId, String structureId, Map<String, dynamic> reportData, String? summary) async {
  final userId = supabase.auth.currentUser?.id;
  
  await supabase.from('hospital_reports').insert({
    'dispatch_id': dispatchId,
    'incident_id': incidentId,
    'structure_id': structureId,
    'report_data': reportData,
    'summary': summary,
    'sent_by': userId,
    'sent_at': DateTime.now().toIso8601String(),
  });
  
  // Optionnel : marquer hospital_data.reportSent = true
  await mergeHospitalData(dispatchId, {
    'reportSent': true,
    'reportSentAt': DateTime.now().toIso8601String(),
  });
}
```

---

## 2. Signalement de contraintes hôpital

### Problème actuel
`HospitalIssuesScreen` n'a aucune persistance.

### Solution : table `hospital_constraints`

**Schéma :**

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | `uuid` | PK auto |
| `structure_id` | `uuid` | FK → health_structures (obligatoire) |
| `constraint_type` | `text` | `lits`, `personnel`, `equipement`, `medicaments`, `surcharge`, `autre` |
| `severity` | `text` | `low`, `medium`, `high`, `critical` |
| `description` | `text` | Description libre |
| `is_resolved` | `boolean` | Défaut `false` |
| `resolved_at` | `timestamptz` | Quand résolu |
| `resolved_by` | `uuid` | Qui a résolu |
| `reported_by` | `uuid` | auth.uid() |

**RLS :** l'hôpital peut créer/modifier ses propres contraintes. Les opérateurs voient tout.

### Code Dart

```dart
Future<void> reportConstraint(String structureId, String type, String severity, String description) async {
  await supabase.from('hospital_constraints').insert({
    'structure_id': structureId,
    'constraint_type': type,
    'severity': severity,
    'description': description,
    'reported_by': supabase.auth.currentUser?.id,
  });
}

Future<void> resolveConstraint(String constraintId) async {
  await supabase.from('hospital_constraints').update({
    'is_resolved': true,
    'resolved_at': DateTime.now().toIso8601String(),
    'resolved_by': supabase.auth.currentUser?.id,
  }).eq('id', constraintId);
}
```

---

## 3. Triage — Champs complets à écrire dans `hospital_data`

Le dashboard affiche désormais : `symptoms`, `provisionalDiagnosis`, `triageNotes`, `triageRecordedAt`.

### Clés JSON triage (à écrire via `mergeHospitalData`)

| Clé | Type | Description |
|-----|------|-------------|
| `triageLevel` | `string` | `rouge`, `orange`, `jaune`, `vert` |
| `symptoms` | `string[]` ou `string` | Liste des symptômes identifiés |
| `provisionalDiagnosis` | `string` | Diagnostic provisoire |
| `triageNotes` | `string` | Notes libres du triage |
| `triageRecordedAt` | `string` | ISO 8601 timestamp |
| `vitals` | `object` | Voir section vitaux |

### Objet `vitals` complet

```json
{
  "bloodPressure": "120/80",
  "heartRate": 72,
  "temperature": 37.2,
  "spO2": 98,
  "respiratoryRate": 16,
  "glasgowScore": 15,
  "painScore": 3,
  "weight": 70
}
```

**Toutes les valeurs vitales sont facultatives.** Le dashboard n'affiche que celles qui sont renseignées.

### Exemple complet triage

```dart
await mergeHospitalData(dispatchId, {
  'status': 'triage',
  'triageLevel': 'orange',
  'symptoms': ['douleur thoracique', 'dyspnée'],
  'provisionalDiagnosis': 'Suspicion SCA',
  'triageNotes': 'Patient conscient, Glasgow 15',
  'triageRecordedAt': DateTime.now().toIso8601String(),
  'vitals': {
    'bloodPressure': '140/90',
    'heartRate': 88,
    'temperature': 37.5,
    'spO2': 96,
    'respiratoryRate': 20,
    'glasgowScore': 15,
    'painScore': 7,
  },
});
```

---

## 4. Clôture — Champs complets

Le dashboard affiche désormais la section « Sortie patient » avec type, notes et date.

| Clé | Type | Description |
|-----|------|-------------|
| `dischargeType` | `string` | `guerison`, `transfert`, `deces`, `sortie_contre_avis` |
| `dischargeNotes` | `string` | Notes de sortie |
| `dischargedAt` | `string` | ISO 8601 timestamp |

```dart
Future<void> closeCase(String dispatchId) async {
  // 1. Écrire la clôture dans hospital_data
  await mergeHospitalData(dispatchId, {
    'status': 'termine',
    'dischargeType': _selectedDischargeType,
    'dischargeNotes': _notesController.text,
    'dischargedAt': DateTime.now().toIso8601String(),
  });
  
  // 2. Fermer le dispatch
  await supabase.from('dispatches').update({
    'status': 'completed',
    'completed_at': DateTime.now().toIso8601String(),
  }).eq('id', dispatchId);
  
  // 3. Envoyer le rapport final
  await sendReportToHQ(dispatchId, incidentId, structureId, buildReportPayload(), summary);
}
```

---

## 5. Historique des interventions par structure

### Problème actuel
`HospitalHistoryScreen` utilise des données mockées.

### Solution : requête sur `dispatches` complétés

```dart
Future<List<Map<String, dynamic>>> fetchHistory(String structureId) async {
  final res = await supabase
    .from('dispatches')
    .select('''
      id, status, created_at, completed_at, hospital_data, hospital_status,
      incidents!inner(id, title, reference, caller_name, caller_phone, type, priority, commune, created_at),
      units(callsign, type)
    ''')
    .eq('assigned_structure_id', structureId)
    .inFilter('status', ['completed', 'cancelled', 'arrived_hospital', 'mission_end'])
    .order('created_at', ascending: false)
    .limit(100);
  
  return List<Map<String, dynamic>>.from(res);
}
```

### KPIs à calculer côté mobile

```dart
// Nombre total de cas traités
final totalCases = history.where((h) => h['status'] == 'completed').length;

// Temps moyen de prise en charge (admission → clôture)
final avgDuration = history
  .where((h) => h['hospital_data']?['arrivalTime'] != null && h['completed_at'] != null)
  .map((h) {
    final arrival = DateTime.parse(h['created_at']);
    final completed = DateTime.parse(h['completed_at']);
    return completed.difference(arrival).inMinutes;
  })
  .fold(0, (a, b) => a + b) / totalCases;

// Taux de guérison
final guerisons = history.where((h) => h['hospital_data']?['dischargeType'] == 'guerison').length;
final tauxGuerison = (guerisons / totalCases * 100).round();
```

### Rapports envoyés (historique)

```dart
Future<List<Map<String, dynamic>>> fetchReportHistory(String structureId) async {
  final res = await supabase
    .from('hospital_reports')
    .select('id, dispatch_id, summary, sent_at, report_data')
    .eq('structure_id', structureId)
    .order('sent_at', ascending: false)
    .limit(50);
  
  return List<Map<String, dynamic>>.from(res);
}
```

---

## 6. Temps réel — Récapitulatif

| Élément | Table | Statut |
|---------|-------|--------|
| Parcours clinique (admission → clôture) | `dispatches.hospital_data` | ✅ Realtime actif |
| Rapports finaux | `hospital_reports` | ✅ Realtime actif |
| Contraintes structure | `hospital_constraints` | ✅ Realtime actif |
| Position unités/ambulances | `active_rescuers` | ✅ Realtime actif |

### Écouter les contraintes en temps réel (optionnel, côté dashboard)

```dart
supabase
  .channel('hospital-constraints')
  .onPostgresChanges(
    event: PostgresChangeEvent.all,
    schema: 'public',
    table: 'hospital_constraints',
    callback: (payload) {
      // Refresh la liste des contraintes
    },
  )
  .subscribe();
```

---

## 7. Colonnes `units` — Select complet pour le mobile

Quand l'hôpital charge les dispatches, le select `units` doit inclure :

```dart
units(id, callsign, type, status, location_lat, location_lng, vehicle_type, vehicle_plate, agent_name, battery, heading, last_location_update)
```

**Note :** La table `units` ne contient **pas** de colonne `phone`. Pour le téléphone de l'urgentiste, utiliser `users_directory` :

```dart
final rescuerProfile = await supabase
  .from('users_directory')
  .select('phone, first_name, last_name')
  .eq('assigned_unit_id', unitId)
  .maybeSingle();
```

---

## 8. Synchronisation des statuts — Tableau complet

| Événement mobile | `hospital_data.status` | `dispatches.status` | `dispatches.hospital_status` |
|------------------|------------------------|---------------------|-----------------------------|
| Structure accepte l'alerte | — | *(inchangé)* | `accepted` |
| Structure refuse l'alerte | — | *(inchangé)* | `refused` |
| Admission validée | `admis` | `arrived_hospital` | `accepted` |
| Triage | `triage` | *(inchangé)* | *(inchangé)* |
| PEC démarrée | `prise_en_charge` | *(inchangé)* | *(inchangé)* |
| Monitoring activé | `monitoring` | *(inchangé)* | *(inchangé)* |
| Clôture | `termine` | `completed` | *(inchangé)* |

---

## 9. Règle absolue : FUSIONNER, jamais remplacer

```dart
Future<void> mergeHospitalData(String dispatchId, Map<String, dynamic> newFields) async {
  final res = await supabase
    .from('dispatches')
    .select('hospital_data')
    .eq('id', dispatchId)
    .single();
  
  final existing = (res['hospital_data'] as Map<String, dynamic>?) ?? {};
  final merged = <String, dynamic>{...existing, ...newFields};
  
  await supabase
    .from('dispatches')
    .update({
      'hospital_data': merged,
      'updated_at': DateTime.now().toIso8601String(),
    })
    .eq('id', dispatchId);
}
```

---

## 10. Checklist d'intégration finale

### Envoi rapport
- [ ] `HospitalReportScreen` : remplacer l'alerte factice par `sendReportToHQ` (INSERT dans `hospital_reports`)
- [ ] Construire `report_data` avec toutes les données du parcours clinique
- [ ] Marquer `hospital_data.reportSent = true` après envoi

### Historique
- [ ] `HospitalHistoryScreen` : remplacer `MOCK_CASES` par requête `dispatches` filtrée `completed`
- [ ] Calculer les KPIs (nombre cas, durée moyenne, taux guérison)
- [ ] Afficher la liste des rapports envoyés

### Signalements contraintes
- [ ] `HospitalIssuesScreen` : INSERT dans `hospital_constraints`
- [ ] Afficher la liste des contraintes actives avec possibilité de résoudre

### Triage complet
- [ ] `HospitalTriageScreen` : écrire `symptoms`, `provisionalDiagnosis`, `triageNotes`, `triageRecordedAt`
- [ ] Écrire les vitaux complets (inclure `painScore`, `weight` si disponibles)

### Clôture
- [ ] `HospitalClosureScreen` : écrire `dischargeType`, `dischargeNotes`, `dischargedAt`
- [ ] Fermer le dispatch (`status = completed`)
- [ ] Appeler `sendReportToHQ` automatiquement

### Téléphone unité
- [ ] `fetchCases` : ajouter lookup `users_directory` pour le téléphone de l'urgentiste rattaché

### Navigation
- [ ] `HospitalSettingsScreen` : brancher les routes `Statistiques`, `Paramètres`, `Personnel`, `Notifications` ou les désactiver clairement

---

## 11. Sécurité (RLS)

| Table | Politique | Description |
|-------|-----------|-------------|
| `hospital_reports` | `hospital_insert_own_reports` | INSERT seulement pour sa propre structure |
| `hospital_reports` | `hospital_select_own_reports` | SELECT seulement ses propres rapports |
| `hospital_reports` | `operators_select_all_reports` | SELECT par les opérateurs/admins |
| `hospital_constraints` | `hospital_insert_own_constraints` | INSERT pour sa structure |
| `hospital_constraints` | `hospital_update_own_constraints` | UPDATE pour sa structure |
| `hospital_constraints` | `hospital_select_own_constraints` | SELECT ses propres contraintes |
| `hospital_constraints` | `operators_select_all_constraints` | SELECT par opérateurs/admins |
| `dispatches` | `hospital_update_own_dispatch` | UPDATE seulement ses dispatches assignés |

---

*Document contrat Lovable → Cursor. Toutes les tables, clés JSON et politiques RLS sont stables côté backend. Ne pas renommer sans coordination.*
