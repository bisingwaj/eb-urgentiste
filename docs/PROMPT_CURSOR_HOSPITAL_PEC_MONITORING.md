# Prompt Cursor — Admission complète + Prise en charge + Monitoring

> **Destinataire :** équipe mobile (Cursor / Anti Gravity)  
> **Backend :** Lovable Cloud (Supabase)  
> **Date :** avril 2026  
> **Prérequis :** `PROMPT_CURSOR_INTEGRATION_HOSPITAL_DATA.md` déjà intégré

---

## 1. Résumé des changements côté backend

Le dashboard central affiche désormais **en temps réel** toutes les données que l'app hôpital écrit dans `dispatches.hospital_data` :

- ✅ **Admission** : `arrivalMode`, `arrivalState`, `admissionService`, `arrivalTime`
- ✅ **Triage** : `triageLevel`, `triageNotes`
- ✅ **Constantes vitales** : `vitals` (objet)
- ✅ **Prise en charge** : `observations[]`, `exams[]`, `treatments[]`, `timeline[]`, `treatment` (résumé), `notes` (résumé)
- ✅ **Monitoring** : `monitoringStatus`, `monitoringNotes`, `transferTarget`
- ✅ **Statut global** : `status` (dans hospital_data)

**Tout est en temps réel** via Supabase Realtime sur la table `dispatches`.

---

## 2. Contrat JSON — Clés stables (ne pas renommer)

### 2.1 Admission (3 champs obligatoires)

```json
{
  "status": "admis",
  "arrivalTime": "14:32",
  "arrivalMode": "AMBULANCE",
  "arrivalState": "stable",
  "admissionService": "urgence_generale"
}
```

| Clé | Type | Valeurs acceptées |
|-----|------|-------------------|
| `arrivalMode` | `string` | `AMBULANCE`, `SMUR`, `MOTO`, `PERSONNEL` |
| `arrivalState` | `string` | `stable`, `critique`, `inconscient` |
| `admissionService` | `string` | `urgence_generale`, `trauma`, `pediatrie` |
| `arrivalTime` | `string` | Format `HH:mm` |

**Action `dispatches` :** `status` → `arrived_hospital`, `hospital_status` → `accepted`

### 2.2 Prise en charge

Quand l'écran PEC s'ouvre, `hospital_data.status` → `prise_en_charge`.  
`dispatches.status` reste `arrived_hospital` (inchangé).

| Clé | Type | Description |
|-----|------|-------------|
| `observations` | `array` | `{ id: string, time: string, text: string, status: "Amélioration" \| "Stable" \| "Aggravation" }` |
| `exams` | `array` | `{ id: string, label: string, status: "done" \| "pending" \| "cancelled", result?: string, time: string }` |
| `treatments` | `array` | `{ id: string, name: string, time: string, user: string }` |
| `timeline` | `array` | `{ id: string, time: string, action: string, user: string, type: "action" \| "test" \| "medication" \| "status" \| "alert", isTreatment?: boolean }` |
| `treatment` | `string` | Résumé concaténé des noms de traitements (dashboard) |
| `notes` | `string` | Texte de la dernière observation (dashboard) |

**Exemple payload PEC :**

```json
{
  "status": "prise_en_charge",
  "observations": [
    { "id": "obs-1", "time": "15:10", "text": "Patient conscient, douleur thoracique", "status": "Stable" }
  ],
  "exams": [
    { "id": "ex-1", "label": "ECG", "status": "done", "result": "Rythme sinusal", "time": "15:15" }
  ],
  "treatments": [
    { "id": "tr-1", "name": "Paracétamol 1g IV", "time": "15:20", "user": "Dr. Mukendi" }
  ],
  "timeline": [
    { "id": "tl-1", "time": "15:10", "action": "Observation initiale", "user": "Dr. Mukendi", "type": "action" },
    { "id": "tl-2", "time": "15:15", "action": "ECG réalisé", "user": "Inf. Kabila", "type": "test" },
    { "id": "tl-3", "time": "15:20", "action": "Paracétamol 1g IV", "user": "Dr. Mukendi", "type": "medication", "isTreatment": true }
  ],
  "treatment": "Paracétamol 1g IV",
  "notes": "Patient conscient, douleur thoracique"
}
```

### 2.3 Monitoring (NOUVEAU — à implémenter)

L'écran `HospitalMonitoringScreen` doit maintenant **persister** dans `hospital_data` :

| Clé | Type | Description |
|-----|------|-------------|
| `monitoringStatus` | `string` | `amelioration`, `stable`, `degradation` |
| `monitoringNotes` | `string` | Notes libres de suivi |
| `transferTarget` | `string \| null` | Nom de la structure cible si transfert |

Quand le monitoring est activé, `hospital_data.status` → `monitoring`.

**Exemple payload monitoring :**

```json
{
  "status": "monitoring",
  "monitoringStatus": "amelioration",
  "monitoringNotes": "Patient répond bien au traitement, douleur diminuée",
  "transferTarget": null
}
```

Si transfert demandé :
```json
{
  "status": "monitoring",
  "monitoringStatus": "stable",
  "monitoringNotes": "Nécessite scanner, transfert vers CHU",
  "transferTarget": "CHU de Kinshasa"
}
```

### 2.4 Clôture

| Clé | Type | Description |
|-----|------|-------------|
| `dischargeType` | `string` | `guerison`, `transfert`, `deces`, `sortie_contre_avis` |
| `dischargeNotes` | `string` | Notes de sortie |
| `dischargedAt` | `string` | ISO 8601 timestamp |

Quand clôture validée : `hospital_data.status` → `termine`, `dispatches.status` → `completed`.

---

## 3. Règle absolue : FUSIONNER, jamais remplacer

```dart
// ✅ CORRECT — fusion
final existing = (dispatch['hospital_data'] as Map?) ?? {};
final merged = {...existing, ...newData};
await supabase.from('dispatches').update({'hospital_data': merged}).eq('id', dispatchId);

// ❌ INTERDIT — écrasement
await supabase.from('dispatches').update({'hospital_data': newData}).eq('id', dispatchId);
```

### Helper recommandé

```dart
Future<void> mergeHospitalData(String dispatchId, Map<String, dynamic> newFields) async {
  // 1. Lire le JSON actuel
  final res = await supabase
    .from('dispatches')
    .select('hospital_data')
    .eq('id', dispatchId)
    .single();
  
  final existing = (res['hospital_data'] as Map<String, dynamic>?) ?? {};
  
  // 2. Fusionner (les tableaux sont remplacés entièrement par la version la plus récente)
  final merged = <String, dynamic>{...existing, ...newFields};
  
  // 3. Écrire
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

## 4. Synchronisation des statuts `dispatches.status`

```dart
Future<void> updateCaseStatus(String dispatchId, Map<String, dynamic> hospitalDataFields, {String? dispatchStatus}) async {
  final updatePayload = <String, dynamic>{};
  
  // Merge hospital_data
  final res = await supabase.from('dispatches').select('hospital_data').eq('id', dispatchId).single();
  final existing = (res['hospital_data'] as Map<String, dynamic>?) ?? {};
  updatePayload['hospital_data'] = {...existing, ...hospitalDataFields};
  updatePayload['updated_at'] = DateTime.now().toIso8601String();
  
  // Optionally update dispatch status
  if (dispatchStatus != null) {
    updatePayload['status'] = dispatchStatus;
  }
  
  // Admission-specific columns
  if (hospitalDataFields['status'] == 'admis') {
    updatePayload['admission_recorded_at'] = DateTime.now().toIso8601String();
    // admission_recorded_by sera l'auth.uid() côté RLS
  }
  
  await supabase.from('dispatches').update(updatePayload).eq('id', dispatchId);
}
```

### Tableau de synchronisation des statuts

| Événement mobile | `hospital_data.status` | `dispatches.status` |
|------------------|------------------------|---------------------|
| Admission validée | `admis` | `arrived_hospital` |
| PEC démarrée | `prise_en_charge` | *(inchangé)* |
| Monitoring activé | `monitoring` | *(inchangé)* |
| Clôture | `termine` | `completed` |

---

## 5. Implémentation du Monitoring (HospitalMonitoringScreen)

### Ce qui doit changer

L'écran `HospitalMonitoringScreen.tsx` gère actuellement l'état **en mémoire locale** uniquement. Il faut maintenant appeler `updateCaseStatus` pour persister.

### Code à ajouter

```dart
// Dans HospitalMonitoringScreen — bouton "Enregistrer suivi"
Future<void> _saveMonitoring() async {
  await updateCaseStatus(widget.dispatchId, {
    'status': 'monitoring',
    'monitoringStatus': _selectedStatus, // amelioration | stable | degradation
    'monitoringNotes': _notesController.text,
    'transferTarget': _transferTarget, // null si pas de transfert
  });
}
```

### Bouton transfert

Si l'utilisateur choisit "Transférer" :

```dart
Future<void> _requestTransfer(String targetStructureName) async {
  await updateCaseStatus(widget.dispatchId, {
    'status': 'monitoring',
    'monitoringStatus': _selectedStatus,
    'transferTarget': targetStructureName,
    'monitoringNotes': 'Transfert demandé vers $targetStructureName',
  });
  
  // Notification visible côté dashboard en temps réel
}
```

---

## 6. Temps réel — Ce qui est déjà configuré

| Élément | Statut |
|---------|--------|
| `dispatches` sur Supabase Realtime | ✅ Actif |
| Dashboard écoute `hospital_data` changes | ✅ Implémenté |
| Dashboard affiche observations, exams, timeline | ✅ Implémenté |
| Dashboard affiche monitoring status + transfert | ✅ Implémenté |
| RLS `hospital_update_own_dispatch` | ✅ Actif — la structure ne peut modifier que les dispatches qui lui sont assignés |

**Aucune action côté backend n'est nécessaire.** Toute écriture dans `hospital_data` est immédiatement visible sur le dashboard central.

---

## 7. Résumé des écrans à modifier

| Écran | Action |
|-------|--------|
| `HospitalAdmissionScreen` | ✅ Déjà OK — écrit `arrivalMode`, `arrivalState`, `admissionService` |
| `HospitalPriseEnChargeScreen` | ✅ Vérifier que `observations`, `exams`, `treatments`, `timeline`, `treatment`, `notes` sont bien écrits via `mergeHospitalData` |
| `HospitalMonitoringScreen` | ⚠️ **À MODIFIER** — brancher sur `updateCaseStatus` avec `monitoringStatus`, `monitoringNotes`, `transferTarget` |
| `HospitalClotureScreen` | ✅ Vérifier que `dischargeType`, `dischargeNotes`, `dischargedAt` sont écrits et `dispatches.status` → `completed` |

---

## 8. Sécurité (RLS)

La politique `hospital_update_own_dispatch` garantit que :
- Un utilisateur `hopital` ne peut modifier que les dispatches dont `assigned_structure_id` correspond à sa structure liée
- La fusion JSON respecte cette contrainte — impossible de modifier un dispatch d'une autre structure

---

## 9. Checklist d'intégration

- [ ] `HospitalMonitoringScreen` : appeler `mergeHospitalData` avec `monitoringStatus`, `monitoringNotes`, `transferTarget`
- [ ] `HospitalMonitoringScreen` : mettre `hospital_data.status` = `monitoring`
- [ ] `HospitalPriseEnChargeScreen` : vérifier que le champ `treatment` (résumé string) est bien calculé et écrit
- [ ] `HospitalPriseEnChargeScreen` : vérifier que le champ `notes` = texte dernière observation
- [ ] `HospitalClotureScreen` : `dispatches.status` → `completed` + `hospital_data.status` → `termine`
- [ ] Tous les écrans : utiliser `mergeHospitalData` (fusion), jamais d'écrasement direct
- [ ] Tester temps réel : ouvrir le dashboard + l'app hôpital, vérifier que chaque sync PEC/monitoring apparaît instantanément

---

*Document contrat Lovable → Cursor. Toutes les clés JSON sont stables côté backend. Ne pas renommer sans coordination.*
