# 📋 Plan de synchronisation — Statuts Mission Mobile

> Document de référence pour corriger la synchronisation des statuts entre l'app mobile et le dashboard Lovable.
> Basé sur l'analyse de `GESTION_STATUTS_URGENTISTE.md` vs l'implémentation actuelle.

---

## 1. Flow complet attendu (rappel)

```
                         APP MOBILE (SignalementScreen)
                         ==============================

standby → reception → [swipe] → arrival → [arrivée] → assessment → aid → decision
                                                                          ↓
                                                                ┌─────────┴──────────┐
                                                                │                    │
                                                           "Stable"          "Transport/Critique"
                                                                ↓                    ↓
                                                           completed            assignment
                                                                ↓              (hôpital choisi)
                                                           closure                  ↓
                                                                           transport_mode
                                                                         (choix du véhicule)
                                                                         = EN ROUTE HÔPITAL
                                                                                  ↓
                                                                             transport
                                                                       (conduite vers hôpital)
                                                                                  ↓
                                                                        [Arrivée hôpital]
                                                                                  ↓
                                                                             closure
```

---

## 2. Mapping des étapes UI → écritures Supabase

Chaque transition doit écrire dans **3 tables** simultanément :

| Étape UI | Action utilisateur | `dispatches.status` | `incidents.status` | `active_rescuers.status` |
|---|---|---|---|---|
| `reception` → `arrival` | Swipe "Débuter intervention" | `en_route` | `en_route` | `en_route` |
| `arrival` → `assessment` | Bouton "Arrivée sur site" | `on_scene` + `arrived_at=now()` | `arrived` | `on_scene` |
| `decision` → `closure` | "Traité sur place" | `completed` + `completed_at=now()` | `resolved` + `resolved_at=now()` | `active` |
| `transport_mode` → `transport` | Choix du véhicule | `en_route_hospital` | `en_route_hospital` | `en_route` |
| `transport` → `closure` | "Arrivée à l'hôpital" | `arrived_hospital` | `arrived_hospital` | `on_scene` |
| `closure` (auto ou bouton) | Clôture finale | `completed` + `completed_at=now()` | `resolved` + `resolved_at=now()` | `active` |

---

## 3. Corrections à apporter — Fichier par fichier

### 3.1 — `src/hooks/useActiveMission.ts`

**Ligne 12** — Élargir le type `dispatch_status` :

```diff
- dispatch_status: 'dispatched' | 'en_route' | 'on_scene' | 'completed';
+ dispatch_status: 'dispatched' | 'en_route' | 'on_scene' | 'en_route_hospital' | 'arrived_hospital' | 'mission_end' | 'completed';
```

---

### 3.2 — `src/contexts/MissionContext.tsx`

#### 3.2.1 — Signature de `updateDispatchStatus` (L22 + L160)

```diff
- updateDispatchStatus: (status: 'en_route' | 'on_scene' | 'completed') => Promise<void>;
+ updateDispatchStatus: (status: 'en_route' | 'on_scene' | 'en_route_hospital' | 'arrived_hospital' | 'completed') => Promise<void>;
```

#### 3.2.2 — Mapping `dispatches → incidents` (L183-187)

```diff
  const incidentStatusMap: Record<string, string> = {
    en_route: 'en_route',
    on_scene: 'arrived',
+   en_route_hospital: 'en_route_hospital',
+   arrived_hospital: 'arrived_hospital',
    completed: 'resolved',
  };
```

#### 3.2.3 — Mapping `dispatches → active_rescuers` (L199-201)

Remplacer le ternaire par un objet de mapping :

```diff
- const rescuerStatus = status === 'en_route' ? 'en_route'
-   : status === 'on_scene' ? 'on_scene'
-   : 'active';
+ const rescuerStatusMap: Record<string, string> = {
+   en_route: 'en_route',
+   on_scene: 'on_scene',
+   en_route_hospital: 'en_route',
+   arrived_hospital: 'on_scene',
+   completed: 'active',
+ };
+ const rescuerStatus = rescuerStatusMap[status] || 'active';
```

#### 3.2.4 — Filtre `fetchActiveMission` (L68)

```diff
- .in('status', ['dispatched', 'en_route', 'on_scene'])
+ .in('status', ['dispatched', 'en_route', 'on_scene', 'en_route_hospital', 'arrived_hospital', 'mission_end'])
```

#### 3.2.5 — Timestamps additionnels (dans le corps de `updateDispatchStatus`)

```diff
  const updateData: any = { status };
  if (status === 'on_scene') updateData.arrived_at = new Date().toISOString();
  if (status === 'completed') updateData.completed_at = new Date().toISOString();
+ if (status === 'arrived_hospital') updateData.arrived_at = new Date().toISOString();
```

Et pour l'incident, ajouter `resolved_at` quand on passe en resolved :

```diff
  const { error: incidentError } = await supabase
    .from('incidents')
-   .update({ status: incidentStatus })
+   .update({
+     status: incidentStatus,
+     ...(incidentStatus === 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
+   })
    .eq('id', activeMission.incident_id);
```

---

### 3.3 — `src/screens/urgentiste/SignalementScreen.tsx`

#### 3.3.1 — `handleSelectTransportMode` (L322-332)

Ajouter l'écriture `en_route_hospital` quand l'urgentiste choisit le véhicule (= il part vers l'hôpital) :

```diff
- const handleSelectTransportMode = (mode) => {
+ const handleSelectTransportMode = async (mode) => {
    setTransportMode(mode);
+   try {
+     await updateDispatchStatus('en_route_hospital');
+   } catch (err) {
+     console.error("Failed to update en_route_hospital", err);
+   }
    transitionTo("transport");
    // ... timeline event
  };
```

#### 3.3.2 — `handleArrivedAtHospital` (L333-341)

Écrire `arrived_hospital` **avant** `completed` :

```diff
  const handleArrivedAtHospital = async () => {
    try {
-     await updateDispatchStatus('completed');
+     await updateDispatchStatus('arrived_hospital');
+     await updateDispatchStatus('completed');
      transitionTo("closure");
-     addTimelineEvent("Arrivée à l'hôpital", "check-circle");
+     addTimelineEvent("Arrivée à l'hôpital — Mission terminée", "check-circle");
    } catch (err) {
      console.error("Failed to arrive at hospital", err);
    }
  };
```

#### 3.3.3 — Mapping `dispatch_status → step` dans useEffect (L116-124)

```diff
  useEffect(() => {
    if (activeMission) {
      setSelectedMission(activeMission);
      if (activeMission.dispatch_status === 'dispatched' && step === 'standby') setStep('reception');
      if (activeMission.dispatch_status === 'en_route') setStep('arrival');
      if (activeMission.dispatch_status === 'on_scene' && ['standby', 'reception', 'arrival'].includes(step)) setStep('assessment');
+     if (activeMission.dispatch_status === 'en_route_hospital') setStep('transport');
+     if (activeMission.dispatch_status === 'arrived_hospital') setStep('closure');
    } else {
      setStep('standby');
    }
  }, [activeMission]);
```

---

### 3.4 — `src/screens/urgentiste/MissionActiveScreen.tsx`

#### 3.4.1 — `STATUS_STEPS` (L10-15)

Ajouter les étapes hospitalières :

```diff
  const STATUS_STEPS = [
    { key: 'dispatched', label: 'Dispatché', icon: 'assignment', color: '#FF9500' },
    { key: 'en_route', label: 'En route', icon: 'local-shipping', color: colors.secondary },
    { key: 'on_scene', label: 'Sur zone', icon: 'place', color: '#FF3B30' },
+   { key: 'en_route_hospital', label: 'Vers hôpital', icon: 'local-hospital', color: '#FF9500' },
+   { key: 'arrived_hospital', label: 'À l\'hôpital', icon: 'domain', color: '#30D158' },
    { key: 'completed', label: 'Terminé', icon: 'check-circle', color: '#30D158' },
  ] as const;
```

#### 3.4.2 — `handleNextStatus` (L94-101)

```diff
  const nextStatuses: Record<string, string> = {
    dispatched: 'en_route',
    en_route: 'on_scene',
-   on_scene: 'completed',
+   on_scene: 'completed',
+   en_route_hospital: 'arrived_hospital',
+   arrived_hospital: 'completed',
  };
```

---

## 4. Séquence d'implémentation recommandée

```
Étape 1 → useActiveMission.ts          (2 min — juste le type)
Étape 2 → MissionContext.tsx            (10 min — mappings + filtre + timestamps)
Étape 3 → SignalementScreen.tsx         (5 min — 3 modifications ciblées)
Étape 4 → MissionActiveScreen.tsx       (5 min — stepper + next status)
Étape 5 → Test end-to-end              (parcours 1 et parcours 2)
```

---

## 5. Vérification post-implémentation

### Parcours 1 — Traité sur place
```
dispatched → en_route → on_scene → completed
```
- [ ] Le dashboard voit chaque transition en temps réel
- [ ] L'incident passe à `resolved` à la fin
- [ ] L'unité revient à `available`

### Parcours 2 — Transfert hospitalier
```
dispatched → en_route → on_scene → en_route_hospital → arrived_hospital → completed
```
- [ ] Le dashboard voit `en_route_hospital` quand le véhicule est choisi
- [ ] Le dashboard voit `arrived_hospital` quand l'urgentiste clique "Arrivée à l'hôpital"
- [ ] L'incident passe `en_route_hospital` → `arrived_hospital` → `resolved`
- [ ] L'unité fait `en_route` → `on_scene` → `available` via le trigger
