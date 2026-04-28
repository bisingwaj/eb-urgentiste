# Gestion de la Disponibilité (Duty Status)

Ce document explique le fonctionnement du commutateur "Activer/Désactiver le service" dans l'application mobile **EB-Urgence** et son impact sur la base de données pour l'équipe Backend/Dispatch.

## Vue d'ensemble

La disponibilité d'un agent (secouriste/urgentiste) détermine s'il peut recevoir des missions de la part du Dispatch. Cet état est géré localement dans l'application et synchronisé en temps réel avec Supabase.

## Schéma de Données

L'état de service impacte la table `users_directory` avec les colonnes suivantes :

| Colonne | Type | Valeur "En Service" | Valeur "Hors Service" | Description |
| :--- | :--- | :--- | :--- | :--- |
| `available` | `boolean` | `true` | `false` | Indicateur binaire pour les filtres de dispatch rapide. |
| `status` | `string` | `'active'` | `'offline'` | État détaillé de l'utilisateur. |

## Logique de l'Application Mobile

### 1. Méthode technique (Requête Supabase)

Le changement d'état est effectué via une requête `UPDATE` directe sur la table `users_directory`.

**Code implémenté dans le client mobile :**
```typescript
const { error } = await supabase
  .from("users_directory")
  .update({ 
    available: val,           // boolean (true/false)
    status: val ? "active" : "offline" 
  })
  .eq("id", profile.id);      // UUID de l'utilisateur
```

**Détails de l'appel :**
- **Action** : Bascule du commutateur (Switch) dans l'onglet Profil.
- **Paramètres** : 
    - `val` : `true` pour "Activer le service", `false` pour "Désactiver".
    - `profile.id` : L'identifiant unique de l'agent authentifié.
- **Rafraîchissement** : En cas de succès (`error` est nul), l'application appelle `refreshProfile()` pour synchroniser l'état local du `AuthProvider`.

### 2. Verrouillage de sécurité
Pour éviter les incohérences opérationnelles, le commutateur est **verrouillé (désactivé)** si une mission est en cours (`activeMission` non nulle). Un agent ne peut pas se mettre "Hors Service" tant qu'il n'a pas terminé sa mission actuelle.

## Impacts pour le Backend / Dispatcher

- **Filtrage des Agents** : Le portail Dispatch ne doit proposer des missions qu'aux agents ayant `available = true` et `status = 'active'`.
- **Statistiques** : Les changements d'état peuvent être utilisés pour calculer le temps de service effectif des agents.
- **Déconnexion** : Actuellement, la déconnexion (`signOut`) ne bascule pas automatiquement l'agent en `'offline'`. Il est recommandé que le backend ou une fonction Edge vérifie périodiquement l'activité ou que l'application force le passage hors service lors du logout si nécessaire.

---
*Dernière mise à jour : Avril 2026*
