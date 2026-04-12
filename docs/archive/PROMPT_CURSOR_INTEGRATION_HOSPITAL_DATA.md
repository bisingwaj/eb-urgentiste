# Prompt Cursor — Intégration `hospital_data` dans l'app Structure (eb-structure)

> **Destinataire :** Cursor / Anti Gravity — app Flutter `eb-structure`
> **Backend :** Supabase (Lovable Cloud) — table `dispatches`
> **Date :** Avril 2026 — v1.0

---

## 1. Contexte

Le backend Lovable a ajouté une colonne **`dispatches.hospital_data`** (JSONB) pour persister toutes les données du parcours hospitalier (admission, triage, signes vitaux, prise en charge). Le dashboard affiche ces données **en temps réel**. L'application structure doit maintenant **écrire** dans cette colonne à chaque étape du parcours patient.

---

## 2. Schéma de la colonne `hospital_data`

```sql
-- Colonne ajoutée sur dispatches
hospital_data    JSONB DEFAULT '{}'
admission_recorded_at  TIMESTAMPTZ   -- horodatage serveur de la validation admission
admission_recorded_by  UUID          -- FK users_directory.id du soignant
```

### Structure JSON attendue (fusion progressive)

```jsonc
{
  // — Étape 1 : Admission (HospitalAdmissionScreen)
  "status": "admis",              // en_attente | en_cours | admis | triage | prise_en_charge | termine
  "arrivalTime": "14:32",
  "arrivalMode": "AMBULANCE",     // AMBULANCE | SMUR | MOTO | PERSONNEL
  "arrivalState": "stable",       // stable | critique | inconscient
  "admissionService": "urgence_generale", // urgence_generale | trauma | pediatrie

  // — Étape 2 : Triage (HospitalTriage)
  "triageLevel": "orange",        // rouge | orange | jaune | vert
  "triageNotes": "Fracture ouverte tibia droit",
  "triageRecordedAt": "2026-04-09T14:45:00Z",

  // — Étape 3 : Signes vitaux (à tout moment)
  "vitals": {
    "bloodPressure": "120/80",
    "heartRate": 92,
    "temperature": 37.8,
    "spO2": 96,
    "respiratoryRate": 18,
    "glasgowScore": 14
  },

  // — Étape 4 : Prise en charge
  "treatment": "Immobilisation + antalgiques IV",
  "notes": "Patient conscient, douleur 7/10",

  // — Étape 5 : Clôture
  "dischargeType": "hospitalisation", // hospitalisation | transfert | sortie | deces
  "dischargeNotes": "Admis en chirurgie orthopédique"
}
```

**RÈGLE CRITIQUE : FUSION, PAS ÉCRASEMENT.**
À chaque étape, faire un **merge** avec les données existantes :

```dart
// ❌ MAUVAIS — écrase tout
await supabase.from('dispatches').update({
  'hospital_data': newData,
}).eq('id', dispatchId);

// ✅ BON — fusionne avec l'existant
final existing = await supabase
  .from('dispatches')
  .select('hospital_data')
  .eq('id', dispatchId)
  .single();

final merged = {
  ...(existing.data?['hospital_data'] as Map? ?? {}),
  ...newStepData,
};

await supabase.from('dispatches').update({
  'hospital_data': merged,
}).eq('id', dispatchId);
```

---

## 3. Mapping `hospital_data.status` ↔ `dispatches.status`

Quand vous mettez à jour `hospital_data.status`, mettez aussi à jour `dispatches.status` :

| `hospital_data.status` | `dispatches.status` | Quand |
|------------------------|---------------------|-------|
| `en_attente` | *(inchangé)* | État initial |
| `en_cours` | `en_route_hospital` | Ambulance en route |
| `admis` | `arrived_hospital` | Formulaire admission validé |
| `triage` | `arrived_hospital` | *(inchangé, déjà arrivé)* |
| `prise_en_charge` | `arrived_hospital` | *(inchangé)* |
| `termine` | `completed` | Cas clôturé |

```dart
Future<void> updateCaseStatus(String dispatchId, String internalStatus, Map<String, dynamic> data) async {
  // 1. Lire l'existant
  final res = await supabase
    .from('dispatches')
    .select('hospital_data')
    .eq('id', dispatchId)
    .single();

  final existing = (res.data?['hospital_data'] as Map<String, dynamic>?) ?? {};

  // 2. Fusionner
  final merged = {...existing, ...data, 'status': internalStatus};

  // 3. Déterminer le status dispatch
  String? dispatchStatus;
  if (internalStatus == 'admis') dispatchStatus = 'arrived_hospital';
  if (internalStatus == 'termine') dispatchStatus = 'completed';

  // 4. Écrire
  final updates = <String, dynamic>{
    'hospital_data': merged,
  };
  if (dispatchStatus != null) {
    updates['status'] = dispatchStatus;
  }
  // Horodatage admission
  if (internalStatus == 'admis') {
    updates['admission_recorded_at'] = DateTime.now().toUtc().toIso8601String();
    // admission_recorded_by = ID du soignant connecté (users_directory.id)
  }
  if (internalStatus == 'termine') {
    updates['completed_at'] = DateTime.now().toUtc().toIso8601String();
  }

  await supabase
    .from('dispatches')
    .update(updates)
    .eq('id', dispatchId);
}
```

---

## 4. Étape Admission — 3 sous-étapes obligatoires

L'écran `HospitalAdmissionScreen` impose **3 choix séquentiels** avant validation :

### Étape 1 — Mode d'arrivée (`arrivalMode`)

| Clé | Libellé UI |
|-----|-----------|
| `AMBULANCE` | Ambulance standard |
| `SMUR` | Unité SMUR / Réa |
| `MOTO` | Moto intervention |
| `PERSONNEL` | Transport perso |

### Étape 2 — État à l'entrée (`arrivalState`)

| Clé | Libellé UI |
|-----|-----------|
| `stable` | Stable |
| `critique` | Critique |
| `inconscient` | Inconscient |

### Étape 3 — Service d'orientation (`admissionService`)

| Clé | Libellé UI |
|-----|-----------|
| `urgence_generale` | Urgence Générale |
| `trauma` | Traumatologie |
| `pediatrie` | Pédiatrie |

### Validation admission

```dart
await updateCaseStatus(dispatchId, 'admis', {
  'arrivalTime': DateFormat('HH:mm').format(DateTime.now()),
  'arrivalMode': selectedMode,         // ex: 'AMBULANCE'
  'arrivalState': selectedState,       // ex: 'stable'
  'admissionService': selectedService, // ex: 'urgence_generale'
});
```

---

## 5. Étape Triage

Après admission, l'écran triage enregistre :

```dart
await updateCaseStatus(dispatchId, 'triage', {
  'triageLevel': 'orange',  // rouge | orange | jaune | vert
  'triageNotes': 'Description clinique...',
  'triageRecordedAt': DateTime.now().toUtc().toIso8601String(),
});
```

---

## 6. Signes vitaux

Peuvent être mis à jour à tout moment (ne changent pas le status) :

```dart
// Lecture + fusion
final res = await supabase.from('dispatches').select('hospital_data').eq('id', dispatchId).single();
final existing = (res.data?['hospital_data'] as Map<String, dynamic>?) ?? {};

final merged = {
  ...existing,
  'vitals': {
    ...(existing['vitals'] as Map<String, dynamic>? ?? {}),
    'bloodPressure': '120/80',
    'heartRate': 92,
    'temperature': 37.8,
    'spO2': 96,
    'respiratoryRate': 18,
    'glasgowScore': 14,
  },
};

await supabase.from('dispatches').update({'hospital_data': merged}).eq('id', dispatchId);
```

---

## 7. Prise en charge & Clôture

```dart
// Prise en charge
await updateCaseStatus(dispatchId, 'prise_en_charge', {
  'treatment': 'Immobilisation + perfusion...',
  'notes': 'Patient stabilisé',
});

// Clôture
await updateCaseStatus(dispatchId, 'termine', {
  'dischargeType': 'hospitalisation', // hospitalisation | transfert | sortie | deces
  'dischargeNotes': 'Admis en chirurgie',
});
```

---

## 8. RLS — Ce que l'app structure peut faire

La politique RLS `hospital_update_own_dispatch` autorise l'UPDATE uniquement sur les dispatches dont `assigned_structure_id` correspond à la structure liée au compte connecté :

```sql
-- Politique existante
Policy: hospital_update_own_dispatch
  USING: assigned_structure_id IN (
    SELECT hs.id FROM health_structures hs
    JOIN users_directory ud ON ud.id = hs.linked_user_id
    WHERE ud.auth_user_id = auth.uid()
  )
```

**Conséquence côté app :** l'app n'a pas besoin de filtrer manuellement — Supabase rejette automatiquement les updates sur des dispatches qui ne lui appartiennent pas.

---

## 9. Realtime — Écouter les mises à jour

Pour que le dashboard et les autres apps voient les mises à jour en temps réel, la table `dispatches` est déjà dans la publication `supabase_realtime`. Aucune action requise côté app structure.

Cependant, si l'app structure veut elle-même écouter les mises à jour (ex: un autre soignant met à jour les vitaux) :

```dart
final channel = supabase.channel('hospital-dispatch-$dispatchId')
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
      final newData = payload.newRecord['hospital_data'] as Map<String, dynamic>?;
      if (newData != null) {
        // Mettre à jour l'état local
        setState(() { caseData = {...caseData, ...newData}; });
      }
    },
  ).subscribe();
```

---

## 10. Checklist d'implémentation

- [ ] **`HospitalAdmissionScreen`** : 3 étapes (arrivalMode, arrivalState, admissionService) → `updateCaseStatus('admis', {...})`
- [ ] **`HospitalTriage`** : triageLevel + triageNotes → `updateCaseStatus('triage', {...})`
- [ ] **Signes vitaux** : fusion dans `hospital_data.vitals` sans changer le status
- [ ] **Prise en charge** : `updateCaseStatus('prise_en_charge', {...})`
- [ ] **Clôture** : `updateCaseStatus('termine', {...})` → `dispatches.status = 'completed'`
- [ ] **Fusion JSON** : TOUJOURS lire l'existant avant d'écrire (merge, pas overwrite)
- [ ] **`dispatches.status`** : synchroniser avec `hospital_data.status` selon le mapping (section 3)
- [ ] **`admission_recorded_at`** : remplir au moment de la validation admission
- [ ] **Realtime** : optionnel côté structure, déjà actif côté dashboard

---

## 11. Ce que le dashboard affiche déjà

Le panneau **"Données hôpital"** dans le module Dispatch affiche en temps réel :

| Donnée | Source JSON |
|--------|------------|
| Statut interne | `hospital_data.status` |
| Mode d'arrivée | `hospital_data.arrivalMode` |
| État patient | `hospital_data.arrivalState` |
| Service | `hospital_data.admissionService` |
| Heure arrivée | `hospital_data.arrivalTime` |
| Triage (couleur) | `hospital_data.triageLevel` |
| Signes vitaux | `hospital_data.vitals.*` (TA, FC, T°, SpO₂, FR, Glasgow) |
| Notes | `hospital_data.notes` |

**Tout ce que vous écrivez dans `hospital_data` apparaît immédiatement sur le dashboard de la centrale.**

---

*Document prêt pour Cursor / Anti Gravity — Avril 2026*
