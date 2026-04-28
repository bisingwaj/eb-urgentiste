# Protocole de Communication Temps Réel : Annulation de Demande Hôpital

Ce document détaille le flux de communication bidirectionnel entre l'Urgentiste et l'Hôpital lors de l'annulation d'une mission, afin de garantir une coupure d'alarme instantanée et une mise à jour fluide de l'interface.

---

## Architecture de Synchronisation

Le système utilise une **double stratégie** pour maximiser la fiabilité :
1.  **Voie de Données (Postgres Changes)** : Synchronisation de l'état de la base de données pour la persistance et l'affichage.
2.  **Voie de Signalisation (Broadcast)** : Signal direct via WebSocket pour les actions critiques (arrêt immédiat de la sirène).

---

## Flux de l'Action "Annuler la demande"

### Étape 1 : Déclenchement (Côté Urgentiste)
*Fichier : `src/contexts/MissionContext.tsx`*

L'urgentiste clique sur "Annuler la demande". L'application exécute `cancelHospitalAssignment()` :

1.  **Mise à jour Base de Données** :
    ```typescript
    supabase.from('dispatches').update({
      assigned_structure_id: structureId, // Re-spécifié pour forcer le filtre Realtime
      hospital_status: 'cancelled',
      hospital_notes: 'Demande annulée par l\'unité'
    }).eq('id', missionId);
    ```
2.  **Émission du Signal Broadcast (Fast Path)** :
    Un message direct est envoyé sur le canal `structure-signals-{structureId}` :
    ```typescript
    {
      type: 'broadcast',
      event: 'CANCEL_MISSION',
      payload: { missionId: missionId }
    }
    ```

---

### Étape 2 : Réception et Traitement (Côté Hôpital)
*Fichier : `src/contexts/HospitalContext.tsx`*

L'application hôpital maintient un canal ouvert filtré par son `health_structure_id`.

#### 2.1 Réception via Broadcast (Instantané)
Dès que le message WebSocket arrive (avant même que la base de données ne confirme l'écriture) :
1.  **Arrêt Alarme** : `DeviceEventEmitter.emit(ALARM_STOP_EVENT)` est déclenché.
2.  **Refresh UI** : Un rafraîchissement des données est lancé en arrière-plan.

#### 2.2 Réception via Postgres Changes (Données)
Supabase notifie l'application du changement dans la table `dispatches` :
1.  **Mise à jour Optimiste** : L'état local `activeCases` est mis à jour immédiatement avec le nouveau `hospital_status`.
2.  **Recalcul des Badges** : Le compteur `pendingAlertCount` est recalculé pour mettre à jour les pastilles de notification sur les onglets.

---

### Étape 3 : Mapping et Affichage (UI Hôpital)
*Fichiers : `src/lib/hospitalCaseMapping.ts` & `src/screens/hospital/HospitalDashboardTab.tsx`*

1.  **Mapping de Statut** : 
    La fonction `mapDispatchRowToEmergencyCase` transforme le statut brut `'cancelled'` en un champ typé pour l'interface. 
    *Correction effectuée* : Auparavant, les statuts inconnus retombaient sur `'pending'`, ce qui empêchait la suppression visuelle du dossier. Maintenant, `'cancelled'` est explicitement reconnu.

2.  **Filtrage UI** :
    Le tableau de bord utilise un `useMemo` pour filtrer les cas affichés :
    ```typescript
    activeCases.filter(c => c.hospitalStatus === 'pending' && !isCaseClosed(c))
    ```
    Dès que `hospitalStatus` passe à `'cancelled'`, le dossier disparaît instantanément de la liste "Demandes Entrantes".

---

## Recommandations pour le Backend (Lovable)

1.  **Replica Identity** : Pour que le filtre Realtime server-side fonctionne sans que le client ait à renvoyer systématiquement le `assigned_structure_id`, il est recommandé de passer la table `dispatches` en `REPLICA IDENTITY FULL`.
2.  **RLS Policies** : Vérifier que l'utilisateur Hôpital possède les droits `SELECT` sur les records dont le statut est `'cancelled'`. Si la politique RLS restreint l'accès aux records `'pending'`, l'événement Realtime d'annulation ne sera pas diffusé car l'Hôpital perdrait le droit de "voir" le record au moment même où il change de statut.
3.  **Nettoyage automatique** : Envisager un worker qui passe les missions `'cancelled'` en statut `'archived'` ou `'completed'` après un certain délai (ex: 24h) pour alléger le chargement du dashboard actif.

---

## Résumé Technique
| Action | Canal | Rôle | Impact UI |
| :--- | :--- | :--- | :--- |
| **Update DB** | Table `dispatches` | Persistance | État permanent |
| **Broadcast** | `structure-signals` | Signalisation | Coupure Sonore |
| **Mapping** | `hospitalCaseMapping` | Transformation | Cohérence UI |
