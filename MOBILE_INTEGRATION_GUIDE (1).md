# 🚑 Guide d'Intégration Mobile — Étoile Bleue

> **Audience** : Développeurs Flutter / Agent IA travaillant sur l'application mobile des urgentistes et agents de terrain.
> **Dernière mise à jour** : 31 mars 2026

---

## Table des matières

1. [Accès Backend](#1-accès-backend)
2. [Schéma de Base de Données](#2-schéma-de-base-de-données)
3. [Système de Rôles](#3-système-de-rôles)
4. [Authentification](#4-authentification)
5. [Edge Functions API](#5-edge-functions-api)
6. [Intégration Agora RTC](#6-intégration-agora-rtc)
7. [Supabase Realtime](#7-supabase-realtime)
8. [GPS Temps Réel](#8-gps-temps-réel)
9. [Mapbox](#9-mapbox)
10. [Storage (Fichiers)](#10-storage-fichiers)
11. [Push Notifications (FCM)](#11-push-notifications-fcm)
12. [Flux Opérationnels](#12-flux-opérationnels)
13. [Messagerie](#13-messagerie)
14. [Signalements](#14-signalements)
15. [Référence Rapide des Enums](#15-référence-rapide-des-enums)

---

## 1. Accès Backend

Le backend repose sur **Supabase** (PostgreSQL + Auth + Realtime + Storage + Edge Functions).

| Paramètre | Valeur |
|---|---|
| **Supabase URL** | `https://npucuhlvoalcbwdfedae.supabase.co` |
| **Anon Key (publishable)** | `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| **Project Ref** | `npucuhlvoalcbwdfedae` |

### Configuration Flutter (Supabase)

```dart
import 'package:supabase_flutter/supabase_flutter.dart';

await Supabase.initialize(
  url: 'https://npucuhlvoalcbwdfedae.supabase.co',
  anonKey: 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
);

final supabase = Supabase.instance.client;
```

### Appel d'une Edge Function

```dart
final response = await supabase.functions.invoke(
  'nom-de-la-fonction',
  body: {'key': 'value'},
);
// response.data contient le JSON de réponse
```

---

## 2. Schéma de Base de Données

### 2.1 `users_directory` — Table utilisateur unifiée (source de vérité)

Tous les utilisateurs (citoyens, secouristes, opérateurs, admins) sont dans cette table unique.

| Colonne | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | Non | `gen_random_uuid()` | Clé primaire |
| `auth_user_id` | uuid | Oui | — | Lien vers `auth.users.id` |
| `role` | enum `user_role` | Non | `'citoyen'` | Rôle de l'utilisateur |
| `first_name` | text | Non | — | Prénom |
| `last_name` | text | Non | — | Nom |
| `email` | text | Oui | — | Email |
| `phone` | text | Oui | — | Téléphone (format +243...) |
| `photo_url` | text | Oui | — | URL avatar (bucket `avatars`) |
| `status` | text | Oui | `'active'` | `online` / `offline` / `active` / `busy` |
| `available` | bool | Oui | `true` | Disponible pour affectation |
| `is_on_call` | bool | Oui | `false` | Actuellement en appel |
| `active_call_id` | text | Oui | — | ID de l'appel en cours |
| `last_seen_at` | timestamptz | Oui | `now()` | Dernier heartbeat |
| `last_call_at` | timestamptz | Oui | — | Dernier appel traité |
| `call_count` | int | Oui | `0` | Nombre d'appels traités |
| `fcm_token` | text | Oui | — | Token FCM pour push notifications |
| `grade` | text | Oui | — | Grade (secouriste/opérateur) |
| `matricule` | text | Oui | — | Matricule employé |
| `specialization` | text | Oui | — | Spécialisation principale |
| `specialties` | text[] | Oui | `'{}'` | Liste de spécialités |
| `zone` | text | Oui | — | Zone d'affectation |
| `vehicle_id` | text | Oui | — | ID du véhicule assigné |
| `assigned_unit_id` | uuid | Oui | — | FK vers `units.id` |
| `blood_type` | text | Oui | — | Groupe sanguin |
| `allergies` | text[] | Oui | `'{}'` | Allergies connues |
| `medical_history` | text[] | Oui | `'{}'` | Antécédents médicaux |
| `medications` | text[] | Oui | `'{}'` | Médicaments en cours |
| `date_of_birth` | date | Oui | — | Date de naissance |
| `address` | text | Oui | — | Adresse |
| `id_number` | text | Oui | — | Numéro de pièce d'identité |
| `emergency_contact_name` | text | Oui | — | Nom contact d'urgence |
| `emergency_contact_phone` | text | Oui | — | Tél contact d'urgence |
| `pin_code` | text | Oui | — | Code PIN tablette |
| `agent_login_id` | text | Oui | — | Login agent |
| `type` | text | Oui | — | Sous-type (médecin, infirmier...) |
| `notes` | text | Oui | — | Notes libres |
| `must_change_password` | bool | Oui | `true` | Doit changer le mot de passe |
| `credentials_sent` | bool | Oui | `false` | Identifiants envoyés par email |
| `created_at` | timestamptz | Oui | `now()` | Date de création |
| `updated_at` | timestamptz | Oui | `now()` | Dernière modification |

### 2.2 `incidents` — Interventions d'urgence

| Colonne | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | Non | `gen_random_uuid()` | Clé primaire |
| `reference` | text | Non | — | Référence unique (ex: `SOS-abc12345-1711900000`) |
| `type` | text | Non | — | Type d'urgence (`accident`, `incendie`, `medical`...) |
| `title` | text | Non | — | Titre court |
| `description` | text | Oui | — | Description détaillée |
| `priority` | enum | Non | `'medium'` | `critical` / `high` / `medium` / `low` |
| `status` | enum | Non | `'new'` | Voir [Enums](#15-référence-rapide-des-enums) |
| `caller_name` | text | Oui | — | Nom de l'appelant |
| `caller_phone` | text | Oui | — | Téléphone appelant |
| `citizen_id` | uuid | Oui | — | `auth.users.id` du citoyen (**pas** `users_directory.id`) |
| `location_lat` | float8 | Oui | — | Latitude initiale |
| `location_lng` | float8 | Oui | — | Longitude initiale |
| `location_address` | text | Oui | — | Adresse textuelle |
| `commune` | text | Oui | — | Commune |
| `ville` | text | Oui | `'Kinshasa'` | Ville |
| `province` | text | Oui | `'Kinshasa'` | Province |
| `caller_realtime_lat` | float8 | Oui | — | Latitude temps réel du citoyen |
| `caller_realtime_lng` | float8 | Oui | — | Longitude temps réel du citoyen |
| `caller_realtime_updated_at` | timestamptz | Oui | — | Timestamp dernière pos GPS |
| `assigned_operator_id` | uuid | Oui | — | Opérateur assigné |
| `media_urls` | text[] | Oui | `'{}'` | URLs des médias (photos/vidéos) |
| `media_type` | text | Oui | `'photo'` | `photo` / `video` / `audio` |
| `device_model` | text | Oui | — | Modèle de l'appareil |
| `battery_level` | text | Oui | — | Niveau de batterie |
| `network_state` | text | Oui | — | État réseau (wifi/4G/3G) |
| `recommended_actions` | text | Oui | — | Actions recommandées (IA/opérateur) |
| `recommended_facility` | text | Oui | — | Structure de santé recommandée |
| `notes` | text | Oui | — | Notes de l'opérateur |
| `ended_by` | text | Oui | — | Qui a terminé (`operator`/`citizen`/`timeout`) |
| `incident_at` | timestamptz | Oui | — | Date/heure de l'incident |
| `resolved_at` | timestamptz | Oui | — | Date de résolution |
| `archived_at` | timestamptz | Oui | — | Date d'archivage |
| `created_at` | timestamptz | Non | `now()` | Création |
| `updated_at` | timestamptz | Non | `now()` | Mise à jour |

### 2.3 `call_history` — Historique des appels

> ⚠️ **IMPORTANT** : Cette table est configurée avec `REPLICA IDENTITY FULL` pour permettre le filtrage Realtime sur `citizen_id`.

| Colonne | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | Non | `gen_random_uuid()` | Clé primaire |
| `channel_name` | text | Non | — | Nom du canal Agora (= référence incident) |
| `call_type` | enum | Non | `'incoming'` | `incoming` / `outgoing` / `internal` |
| `status` | enum | Non | `'ringing'` | `ringing` / `active` / `completed` / `missed` / `failed` |
| `caller_name` | text | Oui | — | Nom de l'appelant |
| `caller_phone` | text | Oui | — | Téléphone |
| `citizen_id` | uuid | Oui | — | `auth.users.id` du citoyen |
| `operator_id` | uuid | Oui | — | UUID de l'opérateur |
| `incident_id` | uuid | Oui | — | FK vers `incidents.id` |
| `has_video` | bool | Oui | `false` | Appel vidéo ? |
| `agora_uid` | int | Oui | — | UID Agora assigné |
| `agora_token` | text | Oui | — | Token RTC Agora |
| `caller_lat` | float8 | Oui | — | Latitude appelant |
| `caller_lng` | float8 | Oui | — | Longitude appelant |
| `location` | jsonb | Oui | — | Données de localisation étendues |
| `triage_data` | jsonb | Oui | `'{}'` | Données de tri médical |
| `commune` | text | Oui | — | Commune |
| `ville` | text | Oui | `'Kinshasa'` | Ville |
| `province` | text | Oui | `'Kinshasa'` | Province |
| `role` | text | Oui | — | Rôle de l'appelant |
| `notes` | text | Oui | — | Notes |
| `ended_by` | text | Oui | — | Qui a raccroché |
| `started_at` | timestamptz | Non | `now()` | Début |
| `answered_at` | timestamptz | Oui | — | Réponse |
| `ended_at` | timestamptz | Oui | — | Fin |
| `duration_seconds` | int | Oui | — | Durée en secondes |
| `created_at` | timestamptz | Non | `now()` | Création |

### 2.4 `call_queue` — File d'attente des appels

| Colonne | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | Non | `gen_random_uuid()` | Clé primaire |
| `channel_name` | text | Non | — | Nom du canal (= référence incident) |
| `incident_id` | uuid | Oui | — | FK vers `incidents.id` |
| `call_id` | uuid | Oui | — | FK vers `call_history.id` |
| `caller_name` | text | Oui | — | Nom |
| `caller_phone` | text | Oui | — | Téléphone |
| `caller_lat` | float8 | Oui | — | Latitude |
| `caller_lng` | float8 | Oui | — | Longitude |
| `priority` | text | Non | `'medium'` | Priorité textuelle |
| `category` | text | Oui | `'general'` | Catégorie |
| `status` | text | Non | `'waiting'` | `waiting` / `assigned` / `answered` / `completed` / `abandoned` |
| `assigned_operator_id` | uuid | Oui | — | Opérateur assigné |
| `estimated_wait_seconds` | int | Oui | `0` | Estimation d'attente |
| `notes` | text | Oui | — | Notes |
| `assigned_at` | timestamptz | Oui | — | Date d'assignation |
| `answered_at` | timestamptz | Oui | — | Date de réponse |
| `completed_at` | timestamptz | Oui | — | Date de complétion |
| `abandoned_at` | timestamptz | Oui | — | Date d'abandon |
| `created_at` | timestamptz | Non | `now()` | Création |

### 2.5 `units` — Unités / Véhicules de terrain

| Colonne | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | Non | `gen_random_uuid()` | Clé primaire |
| `callsign` | text | Non | — | Indicatif radio (ex: `AMB-01`) |
| `type` | text | Non | — | Type (`ambulance`, `pompier`, `police`...) |
| `status` | enum | Non | `'available'` | `available`/`dispatched`/`en_route`/`on_scene`/`returning`/`offline` |
| `location_lat` | float8 | Oui | — | Latitude GPS |
| `location_lng` | float8 | Oui | — | Longitude GPS |
| `heading` | int | Oui | `0` | Cap en degrés (0-360) |
| `battery` | int | Oui | `100` | Batterie tablette (%) |
| `network` | text | Oui | `'4G'` | Type réseau |
| `agent_name` | text | Oui | `'Non assigné'` | Nom de l'agent principal |
| `personnel` | text[] | Oui | `'{}'` | Liste du personnel à bord |
| `vehicle_type` | text | Oui | — | Type de véhicule |
| `vehicle_plate` | text | Oui | — | Plaque d'immatriculation |
| `tablet_id` | text | Oui | — | ID de la tablette |
| `app_version` | text | Oui | `'3.2.1'` | Version de l'app mobile |
| `last_location_update` | timestamptz | Oui | — | Dernier update GPS |
| `created_at` | timestamptz | Non | `now()` | Création |
| `updated_at` | timestamptz | Non | `now()` | Mise à jour |

### 2.6 `dispatches` — Affectations unité ↔ incident

| Colonne | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | Non | `gen_random_uuid()` | Clé primaire |
| `incident_id` | uuid | Non | — | FK vers `incidents.id` |
| `unit_id` | uuid | Non | — | FK vers `units.id` |
| `dispatched_by` | uuid | Oui | — | Opérateur qui a dispatché |
| `status` | text | Non | `'dispatched'` | `dispatched`/`en_route`/`arrived`/`completed` |
| `notes` | text | Oui | — | Notes de dispatch |
| `dispatched_at` | timestamptz | Non | `now()` | Date de dispatch |
| `arrived_at` | timestamptz | Oui | — | Arrivée sur site |
| `completed_at` | timestamptz | Oui | — | Mission terminée |
| `created_at` | timestamptz | Non | `now()` | Création |
| `updated_at` | timestamptz | Non | `now()` | Mise à jour |

### 2.7 `active_rescuers` — GPS temps réel des secouristes

| Colonne | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | Non | `gen_random_uuid()` | Clé primaire |
| `user_id` | uuid | Non | — | `auth.users.id` du secouriste |
| `lat` | float8 | Non | — | Latitude |
| `lng` | float8 | Non | — | Longitude |
| `accuracy` | float8 | Oui | — | Précision GPS en mètres |
| `heading` | float8 | Oui | — | Cap (0-360°) |
| `speed` | float8 | Oui | — | Vitesse (m/s) |
| `battery` | int | Oui | — | Batterie (%) |
| `status` | text | Oui | `'active'` | Statut du secouriste |
| `updated_at` | timestamptz | Non | `now()` | Dernier update |

### 2.8 `health_structures` — Structures de santé

| Colonne | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | Non | `gen_random_uuid()` | Clé primaire |
| `name` | text | Non | — | Nom |
| `type` | text | Non | `'hopital'` | `hopital`/`clinique`/`pharmacie`/`centre_sante`/`dispensaire`/`maternite`/`laboratoire` |
| `address` | text | Non | — | Adresse |
| `phone` | text | Non | — | Téléphone |
| `lat` | float8 | Oui | — | Latitude |
| `lng` | float8 | Oui | — | Longitude |
| `capacity` | int | Oui | `0` | Capacité totale |
| `available_beds` | int | Oui | `0` | Lits disponibles |
| `is_open` | bool | Oui | `true` | Ouvert actuellement |
| `operating_hours` | text | Oui | `'24h/24'` | Horaires |
| `specialties` | text[] | Oui | `'{}'` | Spécialités |
| `equipment` | text[] | Oui | `'{}'` | Équipements |
| `contact_person` | text | Oui | — | Personne de contact |
| `rating` | int | Oui | — | Note (1-5) |
| `created_at` | timestamptz | Oui | `now()` | Création |
| `updated_at` | timestamptz | Oui | `now()` | Mise à jour |

### 2.9 `call_recordings` — Enregistrements d'appels

| Colonne | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | Non | `gen_random_uuid()` | Clé primaire |
| `call_id` | uuid | Non | — | FK vers `call_history.id` |
| `file_url` | text | Non | — | URL du fichier audio |
| `file_type` | text | Non | `'audio'` | Type de fichier |
| `duration_seconds` | int | Oui | — | Durée |
| `file_size_bytes` | bigint | Oui | — | Taille |
| `agora_resource_id` | text | Oui | — | Resource ID Agora |
| `agora_sid` | text | Oui | — | Session ID Agora |
| `created_at` | timestamptz | Non | `now()` | Création |

### 2.10 `call_transcriptions` — Transcriptions d'appels

| Colonne | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | Non | `gen_random_uuid()` | Clé primaire |
| `call_id` | text | Non | — | ID de l'appel |
| `speaker` | text | Non | `'unknown'` | `operator` / `caller` / `unknown` |
| `content` | text | Non | — | Texte transcrit |
| `timestamp_ms` | bigint | Non | epoch*1000 | Timestamp en ms |
| `is_final` | bool | Non | `true` | Transcription finalisée |
| `language` | text | Oui | `'auto'` | Langue détectée |
| `incident_id` | uuid | Oui | — | FK vers `incidents.id` |
| `operator_id` | uuid | Oui | — | UUID opérateur |
| `operator_name` | text | Oui | — | Nom opérateur |
| `created_at` | timestamptz | Non | `now()` | Création |

### 2.11 `messages` — Messagerie opérationnelle

| Colonne | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | Non | `gen_random_uuid()` | Clé primaire |
| `sender_id` | uuid | Non | — | UUID de l'expéditeur |
| `recipient_id` | text | Non | — | UUID ou ID du destinataire |
| `recipient_type` | text | Non | `'unit'` | `unit` / `operator` / `group` |
| `content` | text | Non | — | Contenu du message |
| `type` | text | Non | `'text'` | `text` / `audio` / `image` / `location` |
| `audio_url` | text | Oui | — | URL du message audio |
| `audio_duration` | int | Oui | — | Durée audio (secondes) |
| `intervention_id` | text | Oui | — | Lié à une intervention |
| `read_at` | timestamptz | Oui | — | Date de lecture |
| `created_at` | timestamptz | Non | `now()` | Création |

### 2.12 `notifications` — Notifications utilisateur

| Colonne | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | Non | `gen_random_uuid()` | Clé primaire |
| `user_id` | uuid | Non | — | `auth.users.id` du destinataire |
| `title` | text | Non | — | Titre |
| `message` | text | Non | — | Corps du message |
| `type` | text | Non | `'info'` | `info` / `warning` / `alert` / `dispatch` |
| `is_read` | bool | Non | `false` | Lu ? |
| `created_at` | timestamptz | Non | `now()` | Création |

> **RLS** : Les citoyens ne voient que leurs propres notifications (`user_id = auth.uid()`). Les opérateurs voient tout.

### 2.13 `operator_calls` — Appels inter-opérateurs

| Colonne | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | Non | `gen_random_uuid()` | Clé primaire |
| `caller_profile_id` | uuid | Non | — | `users_directory.id` de l'appelant |
| `callee_profile_id` | uuid | Non | — | `users_directory.id` du destinataire |
| `channel_name` | text | Non | — | Canal Agora |
| `call_type` | text | Non | `'audio'` | `audio` / `video` |
| `status` | text | Non | `'ringing'` | `ringing` / `active` / `ended` / `missed` |
| `caller_name` | text | Oui | — | Nom de l'appelant |
| `started_at` | timestamptz | Non | `now()` | Début |
| `answered_at` | timestamptz | Oui | — | Réponse |
| `ended_at` | timestamptz | Oui | — | Fin |
| `created_at` | timestamptz | Non | `now()` | Création |

### 2.14 `call_transfers` — Transferts d'appels

| Colonne | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | Non | `gen_random_uuid()` | Clé primaire |
| `from_operator_id` | uuid | Non | — | Opérateur source |
| `to_operator_id` | uuid | Non | — | Opérateur cible |
| `call_id` | text | Oui | — | ID de l'appel |
| `channel_name` | text | Oui | — | Canal Agora |
| `incident_id` | uuid | Oui | — | Incident lié |
| `call_type` | text | Non | `'audio'` | Type d'appel |
| `status` | text | Non | `'pending'` | `pending` / `accepted` / `rejected` |
| `transfer_notes` | text | Oui | — | Notes de transfert |
| `context_data` | jsonb | Oui | `'{}'` | Contexte (incident, patient, etc.) |
| `accepted_at` | timestamptz | Oui | — | Date d'acceptation |
| `rejected_at` | timestamptz | Oui | — | Date de rejet |
| `created_at` | timestamptz | Non | `now()` | Création |

### 2.15 `signalements` — Signalements citoyens

| Colonne | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | Non | `gen_random_uuid()` | Clé primaire |
| `reference` | text | Non | — | Référence unique |
| `category` | text | Non | — | Catégorie du signalement |
| `title` | text | Non | — | Titre |
| `description` | text | Oui | — | Description |
| `citizen_name` | text | Oui | — | Nom du citoyen |
| `citizen_phone` | text | Oui | — | Téléphone |
| `is_anonymous` | bool | Oui | `false` | Anonyme ? |
| `lat` | float8 | Oui | — | Latitude |
| `lng` | float8 | Oui | — | Longitude |
| `province` | text | Non | `'Kinshasa'` | Province |
| `ville` | text | Non | `'Kinshasa'` | Ville |
| `commune` | text | Oui | — | Commune |
| `priority` | text | Non | `'moyenne'` | Priorité |
| `status` | text | Non | `'nouveau'` | Statut |
| `structure_id` | uuid | Oui | — | FK vers `health_structures.id` |
| `structure_name` | text | Oui | — | Nom de la structure |
| `assigned_to` | text | Oui | — | Assigné à |
| `created_at` | timestamptz | Oui | `now()` | Création |
| `updated_at` | timestamptz | Oui | `now()` | Mise à jour |

### 2.16 `signalement_media` / `signalement_notes`

**signalement_media** : Pièces jointes (photos, vidéos, audio) liées à un signalement.
- `signalement_id` (uuid, FK) — Signalement parent
- `type` (text, default `'image'`) — `image` / `video` / `audio`
- `url` (text) — URL du fichier (bucket `incidents`)
- `filename` (text) — Nom original
- `thumbnail` (text, nullable) — URL miniature
- `duration` (int, nullable) — Durée pour audio/vidéo

**signalement_notes** : Notes de suivi par les opérateurs.
- `signalement_id` (uuid, FK)
- `author` (text) — Nom de l'auteur
- `text` (text) — Contenu de la note

### 2.17 `sos_responses` — Réponses au questionnaire SOS

| Colonne | Type | Description |
|---|---|---|
| `incident_id` | uuid | FK vers `incidents.id` |
| `call_id` | uuid | FK vers `call_history.id` |
| `question_key` | text | Clé de la question |
| `question_text` | text | Texte affiché |
| `answer` | text | Réponse du citoyen |
| `answered_at` | timestamptz | Date de réponse |

---

## 3. Système de Rôles

L'enum `user_role` définit 7 rôles distincts :

| Rôle | Description | Accès |
|---|---|---|
| `citoyen` | Utilisateur grand public | App mobile uniquement — peut lancer SOS, envoyer signalements |
| `secouriste` | Agent de terrain / urgentiste | App mobile — reçoit dispatches, transmet GPS, communique avec le centre |
| `call_center` | Opérateur du centre d'appels | Dashboard web — gère les appels, dispatch, incidents |
| `superviseur` | Superviseur opérationnel | Dashboard web — tout accès + analytics + supervision |
| `admin` | Administrateur système | Dashboard web — gestion utilisateurs + configuration |
| `hopital` | Personnel hospitalier | App mobile — reçoit patients orientés, lits disponibles |
| `volontaire` | Volontaire formé | App mobile — disponible pour renfort |

### Matrice d'accès par rôle (app mobile)

| Fonctionnalité | citoyen | secouriste | hopital | volontaire |
|---|---|---|---|---|
| Lancer un SOS | ✅ | ❌ | ❌ | ❌ |
| Envoyer un signalement | ✅ | ✅ | ✅ | ✅ |
| Recevoir un dispatch | ❌ | ✅ | ❌ | ✅ |
| Transmettre GPS | ❌ | ✅ | ❌ | ✅ |
| Messagerie opérationnelle | ❌ | ✅ | ✅ | ✅ |
| Voir les incidents | ❌ | ✅ | ✅ | ✅ |
| Mettre à jour un incident | ❌ | ✅ | ❌ | ❌ |
| Gérer les lits | ❌ | ❌ | ✅ | ❌ |

---

## 4. Authentification

### 4.1 Citoyens — SMS OTP (Twilio Verify)

L'auto-inscription est réservée aux citoyens via OTP SMS.

#### Étape 1 : Envoyer le code OTP

```dart
final response = await supabase.functions.invoke('twilio-verify', body: {
  'action': 'send',
  'phone': '+243812345678', // Format E.164 obligatoire
});
// Réponse : { "success": true }
```

#### Étape 2 : Vérifier le code

```dart
final response = await supabase.functions.invoke('twilio-verify', body: {
  'action': 'verify',
  'phone': '+243812345678',
  'code': '123456',
});
// Réponse succès :
// {
//   "success": true,
//   "session": { "access_token": "...", "refresh_token": "..." },
//   "user": { "id": "uuid", "phone": "+243..." },
//   "is_new_user": true
// }
```

> **Important** : Après vérification, utiliser `access_token` et `refresh_token` pour initialiser la session Supabase :
> ```dart
> await supabase.auth.setSession(response.data['session']['access_token']);
> ```

#### Étape 3 : Compléter le profil (si `is_new_user: true`)

```dart
final response = await supabase.functions.invoke('complete-profile', body: {
  'first_name': 'Jean',
  'last_name': 'Dupont',
  'date_of_birth': '1990-01-15',
  'address': 'Commune de Lemba, Kinshasa',
  'blood_type': 'O+',
  'emergency_contact_name': 'Marie Dupont',
  'emergency_contact_phone': '+243823456789',
});
// Réponse : { "success": true, "profile": { ... } }
```

> **Note** : `complete-profile` valide le JWT client via `auth.getUser()` et utilise la clé de rôle service pour écrire dans `users_directory`.

### 4.2 Opérateurs / Secouristes — Email + Mot de passe

Les comptes sont créés par un admin via le dashboard. Un mot de passe temporaire est envoyé par email.

```dart
final response = await supabase.auth.signInWithPassword(
  email: 'agent@etoilebleue.cd',
  password: 'motDePasseTemporaire',
);
```

> Vérifier `users_directory.must_change_password` — si `true`, forcer le changement :
> ```dart
> await supabase.auth.updateUser(UserAttributes(password: 'nouveauMotDePasse'));
> await supabase.from('users_directory').update({'must_change_password': false}).eq('auth_user_id', userId);
> ```

### 4.3 Heartbeat (présence en ligne)

L'app mobile doit envoyer un heartbeat toutes les **30 secondes** :

```dart
Timer.periodic(Duration(seconds: 30), (_) async {
  await supabase.from('users_directory')
    .update({'last_seen_at': DateTime.now().toIso8601String()})
    .eq('auth_user_id', supabase.auth.currentUser!.id);
});
```

### 4.4 Déconnexion

```dart
// Mettre le statut à offline avant de déconnecter
await supabase.from('users_directory')
  .update({'status': 'offline', 'is_on_call': false})
  .eq('auth_user_id', supabase.auth.currentUser!.id);

await supabase.auth.signOut();
```

---

## 5. Edge Functions API

Toutes les Edge Functions sont appelables via `supabase.functions.invoke('nom', body: {...})`.

Base URL : `https://npucuhlvoalcbwdfedae.supabase.co/functions/v1/`

### 5.1 `twilio-verify` — OTP SMS

| Paramètre | Type | Requis | Description |
|---|---|---|---|
| `action` | string | ✅ | `'send'` ou `'verify'` |
| `phone` | string | ✅ | Numéro E.164 (`+243...`) |
| `code` | string | Pour verify | Code à 6 chiffres |

**Réponse (send)** : `{ "success": true }`
**Réponse (verify)** : `{ "success": true, "session": {...}, "user": {...}, "is_new_user": bool }`

### 5.2 `complete-profile` — Finaliser profil citoyen

| Paramètre | Type | Requis | Description |
|---|---|---|---|
| `first_name` | string | ✅ | Prénom |
| `last_name` | string | ✅ | Nom |
| `date_of_birth` | string | Non | Format `YYYY-MM-DD` |
| `address` | string | Non | Adresse |
| `blood_type` | string | Non | Groupe sanguin |
| `emergency_contact_name` | string | Non | Nom contact d'urgence |
| `emergency_contact_phone` | string | Non | Tél contact d'urgence |

> **Auth requise** : Oui (JWT dans le header Authorization)

### 5.3 `agora-token` — Générer un token RTC Agora

| Paramètre | Type | Requis | Description |
|---|---|---|---|
| `channelName` | string | ✅ | Nom du canal Agora |
| `uid` | int | Non | UID Agora (défaut: `0`) |
| `role` | string | Non | `'publisher'` (défaut) ou `'subscriber'` |
| `expireTime` | int | Non | Durée en secondes (défaut: `3600`) |

**Réponse** :
```json
{
  "token": "007eJxT...",
  "appId": "e2e0e5a6ef0d4ce3b2ab9efad48d62cf",
  "channelName": "SOS-abc12345-1711900000",
  "uid": 0,
  "expiresAt": 1711903600
}
```

### 5.4 `agora-recording` — Enregistrement cloud

**Démarrer** :
```json
POST body: { "action": "start", "channelId": "...", "uid": 0, "token": "..." }
Response:  { "resourceId": "...", "sid": "..." }
```

**Arrêter** :
```json
POST body: { "action": "stop", "channelId": "...", "uid": 0, "resourceId": "...", "sid": "..." }
Response:  { "success": true, "fileUrl": "..." }
```

> Fonctions alternatives : `startCloudRecording` et `stopCloudRecording` (wrappers simplifiés).

### 5.5 `send-call-push` — Notification push d'appel entrant

| Paramètre | Type | Requis | Description |
|---|---|---|---|
| `citizenId` | string | ✅ | `auth.users.id` du citoyen cible |
| `callId` | string | ✅ | ID de l'appel (`call_history.id`) |
| `channelName` | string | ✅ | Canal Agora |
| `callerName` | string | ✅ | Nom de l'appelant affiché |
| `callType` | string | Non | `'audio'` ou `'video'` |

> Cette fonction envoie un **Data Message FCM** (pas de notification visible) pour déclencher l'interface d'appel native (CallKit/ConnectionService).

### 5.6 `create-user` — Créer un utilisateur (admin)

| Paramètre | Type | Requis | Description |
|---|---|---|---|
| `email` | string | ✅ | Email du nouvel utilisateur |
| `password` | string | ✅ | Mot de passe temporaire |
| `first_name` | string | ✅ | Prénom |
| `last_name` | string | ✅ | Nom |
| `role` | string | ✅ | Un des 7 rôles valides |
| `phone` | string | Non | Téléphone |
| `matricule` | string | Non | Matricule |

### 5.7 `send-reset-password` — Réinitialiser mot de passe

| Paramètre | Type | Requis | Description |
|---|---|---|---|
| `email` | string | ✅ | Email de l'utilisateur |

---

## 6. Intégration Agora RTC

### 6.1 Configuration

| Paramètre | Valeur |
|---|---|
| **App ID** | `e2e0e5a6ef0d4ce3b2ab9efad48d62cf` |
| **SDK Flutter** | `agora_rtc_engine: ^6.x` |
| **Token** | Généré dynamiquement via Edge Function `agora-token` |

> ⚠️ Le **App Certificate** est stocké côté serveur uniquement (secret `AGORA_APP_CERTIFICATE`). Ne jamais l'embarquer dans l'app.

### 6.2 Flux d'appel SOS (Mobile → Dashboard)

```
┌─────────────────┐                    ┌──────────────┐                  ┌──────────────┐
│   App Mobile    │                    │   Supabase   │                  │  Dashboard   │
│   (Citoyen)     │                    │   Backend    │                  │   (Web)      │
└────────┬────────┘                    └──────┬───────┘                  └──────┬───────┘
         │                                     │                                │
         │ 1. INSERT INTO incidents            │                                │
         │    (reference, citizen_id,          │                                │
         │     location, type, priority)       │                                │
         │ ─────────────────────────────────► │                                │
         │                                     │                                │
         │                                     │ 2. Trigger: on_incident_created│
         │                                     │    → INSERT call_queue         │
         │                                     │    → auto_assign_queue()       │
         │                                     │                                │
         │                                     │ 3. Realtime: call_queue INSERT │
         │                                     │ ──────────────────────────────►│
         │                                     │                                │
         │ 4. Invoke agora-token               │                                │
         │    (channelName = reference)        │                                │
         │ ─────────────────────────────────► │                                │
         │ ◄──────── { token, appId }          │                                │
         │                                     │                                │
         │ 5. Join Agora channel               │    6. Operator joins channel   │
         │    (publisher, uid=0)               │    ◄──────────────────────────│
         │ ═══════════════════════════════════════════════════════════════════│
         │                    AUDIO/VIDEO BIDIRECTIONNEL                      │
         │ ═══════════════════════════════════════════════════════════════════│
```

### 6.3 Flux d'appel sortant (Dashboard → Mobile)

```
┌──────────────┐                    ┌──────────────┐                  ┌─────────────────┐
│  Dashboard   │                    │   Supabase   │                  │   App Mobile    │
│   (Web)      │                    │   Backend    │                  │   (Citoyen)     │
└──────┬───────┘                    └──────┬───────┘                  └────────┬────────┘
       │                                   │                                   │
       │ 1. INSERT call_history            │                                   │
       │    (status:'ringing',             │                                   │
       │     call_type:'outgoing',         │                                   │
       │     citizen_id, channel_name)     │                                   │
       │ ─────────────────────────────►   │                                   │
       │                                   │                                   │
       │ 2. Invoke send-call-push          │                                   │
       │    (citizenId, channelName...)    │                                   │
       │ ─────────────────────────────►   │                                   │
       │                                   │ 3. FCM Data Message              │
       │                                   │ ────────────────────────────────►│
       │                                   │                                   │
       │                                   │ 4. Realtime: call_history INSERT │
       │                                   │ ────────────────────────────────►│
       │                                   │    (filter: citizen_id=auth.uid) │
       │                                   │                                   │
       │                                   │                       5. Show call UI
       │                                   │                       6. Join Agora
       │ ═════════════════════════════════════════════════════════════════════│
       │                    AUDIO/VIDEO BIDIRECTIONNEL                        │
```

### 6.4 Convention de nommage des canaux

| Type d'appel | Format `channel_name` | Exemple |
|---|---|---|
| SOS citoyen | `SOS-{userId_8chars}-{timestamp}` | `SOS-a1b2c3d4-1711900000` |
| Appel sortant | `outbound-{callHistoryId}` | `outbound-550e8400-e29b...` |
| Inter-opérateurs | `op-call-{operatorCallId}` | `op-call-123e4567-e89b...` |

### 6.5 Implémentation Flutter

```dart
import 'package:agora_rtc_engine/agora_rtc_engine.dart';

// 1. Créer le moteur
final engine = createAgoraRtcEngine();
await engine.initialize(RtcEngineContext(
  appId: 'e2e0e5a6ef0d4ce3b2ab9efad48d62cf',
));

// 2. Obtenir le token
final tokenResponse = await supabase.functions.invoke('agora-token', body: {
  'channelName': channelName,
  'uid': 0,
  'role': 'publisher',
});
final token = tokenResponse.data['token'];

// 3. Rejoindre le canal
await engine.joinChannel(
  token: token,
  channelId: channelName,
  uid: 0,
  options: ChannelMediaOptions(
    clientRoleType: ClientRoleType.clientRoleBroadcaster,
    channelProfile: ChannelProfileType.channelProfileCommunication,
  ),
);

// 4. Gérer les événements
engine.registerEventHandler(RtcEngineEventHandler(
  onJoinChannelSuccess: (connection, elapsed) { /* ... */ },
  onUserJoined: (connection, remoteUid, elapsed) { /* ... */ },
  onUserOffline: (connection, remoteUid, reason) { /* ... */ },
));
```

---

## 7. Supabase Realtime

### 7.1 Tables avec Realtime activé

Les tables suivantes émettent des événements Realtime :

| Table | Événements | Usage mobile |
|---|---|---|
| `call_history` | INSERT, UPDATE | Réception d'appels entrants (filtrer `citizen_id`) |
| `call_queue` | INSERT, UPDATE | Suivi de la file d'attente |
| `incidents` | INSERT, UPDATE | Nouveaux incidents, changements de statut |
| `dispatches` | INSERT, UPDATE | Réception de dispatches (secouristes) |
| `messages` | INSERT | Messages en temps réel |
| `active_rescuers` | INSERT, UPDATE, DELETE | Positions GPS (dashboard) |
| `units` | UPDATE | Statut des unités |
| `notifications` | INSERT | Nouvelles notifications |
| `operator_calls` | INSERT, UPDATE | Appels inter-opérateurs |
| `call_transfers` | INSERT, UPDATE | Transferts d'appels |

### 7.2 Écouter les appels entrants (citoyen)

```dart
final userId = supabase.auth.currentUser!.id;

supabase
  .channel('incoming-calls')
  .onPostgresChanges(
    event: PostgresChangeEvent.insert,
    schema: 'public',
    table: 'call_history',
    filter: PostgresChangeFilter(
      type: PostgresChangeFilterType.eq,
      column: 'citizen_id',
      value: userId,
    ),
    callback: (payload) {
      final record = payload.newRecord;
      if (record['status'] == 'ringing' && record['call_type'] == 'outgoing') {
        // Afficher l'interface d'appel entrant
        showIncomingCallScreen(
          channelName: record['channel_name'],
          callerName: record['caller_name'] ?? 'Centre d\'appels',
          callId: record['id'],
          hasVideo: record['has_video'] ?? false,
        );
      }
    },
  )
  .subscribe();
```

> ⚠️ **Critique** : `citizen_id` doit être `auth.users.id` (UUID Auth), pas `users_directory.id`.

### 7.3 Écouter les dispatches (secouriste)

```dart
final unitId = currentUser.assignedUnitId; // ou le user_id du secouriste

supabase
  .channel('my-dispatches')
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
      // Afficher la notification de dispatch
      // Charger l'incident associé
      loadIncident(dispatch['incident_id']);
    },
  )
  .subscribe();
```

### 7.4 Écouter les messages

```dart
supabase
  .channel('messages')
  .onPostgresChanges(
    event: PostgresChangeEvent.insert,
    schema: 'public',
    table: 'messages',
    callback: (payload) {
      final msg = payload.newRecord;
      // Filtrer côté client par recipient_id
      if (msg['recipient_id'] == myId || msg['sender_id'] == myId) {
        addMessageToUI(msg);
      }
    },
  )
  .subscribe();
```

---

## 8. GPS Temps Réel

### 8.1 Transmission de position (secouriste)

L'app mobile des secouristes doit transmettre sa position GPS toutes les **10 secondes** via un `upsert` dans `active_rescuers` :

```dart
import 'package:geolocator/geolocator.dart';

Timer.periodic(Duration(seconds: 10), (_) async {
  final position = await Geolocator.getCurrentPosition(
    desiredAccuracy: LocationAccuracy.high,
  );
  final battery = await Battery().batteryLevel;

  await supabase.from('active_rescuers').upsert({
    'user_id': supabase.auth.currentUser!.id,
    'lat': position.latitude,
    'lng': position.longitude,
    'accuracy': position.accuracy,
    'heading': position.heading,
    'speed': position.speed,
    'battery': battery,
    'status': 'active',
    'updated_at': DateTime.now().toIso8601String(),
  }, onConflict: 'user_id');
});
```

### 8.2 Position temps réel du citoyen (pendant un appel SOS)

Pendant un appel SOS actif, le citoyen doit mettre à jour sa position dans `incidents` :

```dart
Timer.periodic(Duration(seconds: 5), (_) async {
  final position = await Geolocator.getCurrentPosition();
  
  await supabase.from('incidents').update({
    'caller_realtime_lat': position.latitude,
    'caller_realtime_lng': position.longitude,
    'caller_realtime_updated_at': DateTime.now().toIso8601String(),
  }).eq('id', currentIncidentId);
});
```

### 8.3 Nettoyage en fin de session

```dart
// Quand le secouriste se déconnecte ou passe offline
await supabase.from('active_rescuers')
  .delete()
  .eq('user_id', supabase.auth.currentUser!.id);
```

---

## 9. Mapbox

### 9.1 Configuration

| Paramètre | Valeur |
|---|---|
| **Access Token** | `pk.eyJ1...[REDACTED]` |
| **Style URL** | `mapbox://styles/mapbox/dark-v11` |
| **Centre Kinshasa** | `lng: 15.3, lat: -4.325` |
| **Zoom par défaut** | `12` |

### 9.2 Configuration Flutter

```yaml
# pubspec.yaml
dependencies:
  mapbox_maps_flutter: ^2.x
```

```dart
MapWidget(
  cameraOptions: CameraOptions(
    center: Point(coordinates: Position(15.3, -4.325)),
    zoom: 12.0,
  ),
  styleUri: MapboxStyles.DARK,
  // Access token dans AndroidManifest.xml et Info.plist
)
```

### 9.3 Fichiers de configuration natifs

**Android** (`android/app/src/main/AndroidManifest.xml`) :
```xml
<meta-data
  android:name="com.mapbox.token"
  android:value="pk.eyJ1...[REDACTED]" />
```

**iOS** (`ios/Runner/Info.plist`) :
```xml
<key>MBXAccessToken</key>
<string>pk.eyJ1...[REDACTED]</string>
```

---

## 10. Storage (Fichiers)

### 10.1 Buckets disponibles

| Bucket | Public | Usage |
|---|---|---|
| `avatars` | ✅ Oui | Photos de profil utilisateurs |
| `incidents` | ✅ Oui | Photos/vidéos/audio des incidents, enregistrements d'appels |

### 10.2 Upload d'un avatar

```dart
final file = File(imagePath);
final fileName = '${supabase.auth.currentUser!.id}.jpg';

await supabase.storage.from('avatars').upload(
  fileName,
  file,
  fileOptions: FileOptions(upsert: true, contentType: 'image/jpeg'),
);

final publicUrl = supabase.storage.from('avatars').getPublicUrl(fileName);

// Mettre à jour le profil
await supabase.from('users_directory')
  .update({'photo_url': publicUrl})
  .eq('auth_user_id', supabase.auth.currentUser!.id);
```

### 10.3 Upload de médias d'incident

```dart
final fileName = 'incidents/${incidentId}/${DateTime.now().millisecondsSinceEpoch}.jpg';

await supabase.storage.from('incidents').upload(fileName, file);
final url = supabase.storage.from('incidents').getPublicUrl(fileName);

// Ajouter l'URL au tableau media_urls de l'incident
await supabase.from('incidents').update({
  'media_urls': [...currentUrls, url],
}).eq('id', incidentId);
```

### 10.4 URL publique

```
https://npucuhlvoalcbwdfedae.supabase.co/storage/v1/object/public/{bucket}/{path}
```

---

## 11. Push Notifications (FCM)

### 11.1 Configuration Firebase

| Paramètre | Valeur |
|---|---|
| **Projet Firebase** | `etoilebleue2-9f074` |
| **Type** | Data Messages (silencieux, haute priorité) |

### 11.2 Enregistrement du token FCM

Au démarrage de l'app et à chaque rafraîchissement :

```dart
final fcmToken = await FirebaseMessaging.instance.getToken();

await supabase.from('users_directory')
  .update({'fcm_token': fcmToken})
  .eq('auth_user_id', supabase.auth.currentUser!.id);

// Écouter les rafraîchissements
FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
  await supabase.from('users_directory')
    .update({'fcm_token': newToken})
    .eq('auth_user_id', supabase.auth.currentUser!.id);
});
```

### 11.3 Format du Data Message (appel entrant)

Le payload FCM envoyé par `send-call-push` :

```json
{
  "message": {
    "token": "fcm_token_du_citoyen",
    "data": {
      "type": "incoming_call",
      "callId": "550e8400-e29b-41d4-a716-446655440000",
      "channelName": "SOS-a1b2c3d4-1711900000",
      "callerName": "Centre d'appels Étoile Bleue",
      "callType": "audio",
      "timestamp": "1711900000"
    },
    "android": {
      "priority": "high"
    },
    "apns": {
      "headers": {
        "apns-priority": "10",
        "apns-push-type": "voip"
      }
    }
  }
}
```

### 11.4 Traitement côté Flutter

```dart
FirebaseMessaging.onBackgroundMessage(_backgroundHandler);

Future<void> _backgroundHandler(RemoteMessage message) async {
  if (message.data['type'] == 'incoming_call') {
    // Déclencher CallKit (iOS) ou ConnectionService (Android)
    await showCallNotification(
      callId: message.data['callId'],
      channelName: message.data['channelName'],
      callerName: message.data['callerName'],
      callType: message.data['callType'],
    );
  }
}
```

---

## 12. Flux Opérationnels

### 12.1 Cycle de vie d'un incident

```
┌──────┐     ┌────────────┐     ┌─────────────┐     ┌──────────┐     ┌──────────┐
│ new  │────►│ dispatched │────►│ in_progress │────►│ resolved │────►│ archived │
└──────┘     └────────────┘     └─────────────┘     └──────────┘     └──────────┘
                                       │
                                       ├──► en_route
                                       ├──► arrived
                                       ├──► investigating
                                       └──► ended
```

### 12.2 Créer un incident SOS (citoyen)

```dart
final reference = 'SOS-${supabase.auth.currentUser!.id.substring(0,8)}-${DateTime.now().millisecondsSinceEpoch ~/ 1000}';

final response = await supabase.from('incidents').insert({
  'reference': reference,
  'type': 'urgence_medicale', // ou accident, incendie, etc.
  'title': 'Urgence médicale',
  'description': descriptionText,
  'priority': 'critical',
  'status': 'new',
  'citizen_id': supabase.auth.currentUser!.id,
  'caller_name': userProfile.firstName + ' ' + userProfile.lastName,
  'caller_phone': userProfile.phone,
  'location_lat': position.latitude,
  'location_lng': position.longitude,
  'commune': communeName,
  'device_model': deviceInfo.model,
  'battery_level': batteryLevel.toString(),
  'network_state': networkType,
}).select().single();

final incidentId = response['id'];
```

> Le trigger `on_incident_created` insère automatiquement dans `call_queue` et appelle `auto_assign_queue()`.

### 12.3 Dispatch (reception par le secouriste)

Quand un dispatch est créé, le secouriste doit :

1. **Recevoir** la notification Realtime (via `dispatches` INSERT)
2. **Charger** l'incident associé
3. **Mettre à jour** le statut du dispatch :

```dart
// Accepter le dispatch
await supabase.from('dispatches')
  .update({'status': 'en_route'})
  .eq('id', dispatchId);

// Mettre à jour l'unité
await supabase.from('units')
  .update({'status': 'en_route'})
  .eq('id', unitId);

// Arrivée sur site
await supabase.from('dispatches')
  .update({'status': 'arrived', 'arrived_at': DateTime.now().toIso8601String()})
  .eq('id', dispatchId);

// Mission terminée
await supabase.from('dispatches')
  .update({'status': 'completed', 'completed_at': DateTime.now().toIso8601String()})
  .eq('id', dispatchId);

await supabase.from('units')
  .update({'status': 'available'})
  .eq('id', unitId);
```

### 12.4 Mettre à jour la position de l'unité

```dart
await supabase.from('units').update({
  'location_lat': position.latitude,
  'location_lng': position.longitude,
  'heading': position.heading.round(),
  'battery': batteryLevel,
  'network': networkType,
  'last_location_update': DateTime.now().toIso8601String(),
}).eq('id', unitId);
```

---

## 13. Messagerie

### 13.1 Envoyer un message texte

```dart
await supabase.from('messages').insert({
  'sender_id': supabase.auth.currentUser!.id,
  'recipient_id': recipientId, // UUID de l'opérateur, ID de l'unité, ou ID de groupe
  'recipient_type': 'operator', // 'operator' / 'unit' / 'group'
  'content': messageText,
  'type': 'text',
  'intervention_id': currentIncidentId, // optionnel
});
```

### 13.2 Envoyer un message audio

```dart
// 1. Enregistrer l'audio
// 2. Upload dans le bucket incidents
final audioPath = 'messages/${DateTime.now().millisecondsSinceEpoch}.m4a';
await supabase.storage.from('incidents').upload(audioPath, audioFile);
final audioUrl = supabase.storage.from('incidents').getPublicUrl(audioPath);

// 3. Insérer le message
await supabase.from('messages').insert({
  'sender_id': supabase.auth.currentUser!.id,
  'recipient_id': recipientId,
  'recipient_type': 'unit',
  'content': '[Audio]',
  'type': 'audio',
  'audio_url': audioUrl,
  'audio_duration': durationInSeconds,
});
```

### 13.3 Marquer comme lu

```dart
await supabase.from('messages')
  .update({'read_at': DateTime.now().toIso8601String()})
  .eq('id', messageId);
```

---

## 14. Signalements

### 14.1 Créer un signalement (citoyen)

```dart
final reference = 'SIG-${DateTime.now().millisecondsSinceEpoch}';

final response = await supabase.from('signalements').insert({
  'reference': reference,
  'category': 'infrastructure', // infrastructure, sanitaire, securite, environnement...
  'title': 'Route endommagée',
  'description': 'Nid de poule dangereux sur la RN1',
  'citizen_name': isAnonymous ? null : userName,
  'citizen_phone': isAnonymous ? null : userPhone,
  'is_anonymous': isAnonymous,
  'lat': position.latitude,
  'lng': position.longitude,
  'commune': communeName,
}).select().single();

// Ajouter les médias
if (photos.isNotEmpty) {
  for (final photo in photos) {
    final path = 'signalements/${response['id']}/${DateTime.now().millisecondsSinceEpoch}.jpg';
    await supabase.storage.from('incidents').upload(path, photo);
    final url = supabase.storage.from('incidents').getPublicUrl(path);
    
    await supabase.from('signalement_media').insert({
      'signalement_id': response['id'],
      'type': 'image',
      'url': url,
      'filename': path.split('/').last,
    });
  }
}
```

---

## 15. Référence Rapide des Enums

### `call_status`
`ringing` → `active` → `completed` | `missed` | `failed`

### `call_type`
`incoming` | `outgoing` | `internal`

### `incident_priority`
`critical` | `high` | `medium` | `low`

### `incident_status`
`new` | `dispatched` | `in_progress` | `resolved` | `archived` | `pending` | `en_route` | `arrived` | `investigating` | `ended`

### `unit_status`
`available` | `dispatched` | `en_route` | `on_scene` | `returning` | `offline`

### `user_role`
`citoyen` | `secouriste` | `call_center` | `hopital` | `volontaire` | `superviseur` | `admin`

---

## 16. Fonctions SQL utiles

### Trigger `on_incident_created`
Insère automatiquement dans `call_queue` quand un incident est créé avec `status = 'new'`. Inclut une déduplication par `channel_name`.

### Trigger `on_incident_resolved`
Quand un incident passe à `resolved` ou `archived`, marque les entrées `call_queue` correspondantes comme `completed`.

### Fonction `auto_assign_queue()`
Assigne automatiquement les appels en attente aux opérateurs disponibles, en priorisant par criticité et charge de travail.

### Fonction `cleanup_stale_queue_entries()`
Marque comme `abandoned` les entrées de file d'attente vieilles de plus de 5 minutes.

### Trigger `deduplicate_incident()`
Empêche la création d'incidents dupliqués pour un même citoyen dans un intervalle de 30 secondes.

### Trigger `handle_new_user()`
Crée automatiquement une entrée dans `users_directory` quand un nouvel utilisateur s'inscrit via `auth.users`.

---

## 17. Checklist d'intégration

- [ ] Configurer Supabase Flutter (`supabase_flutter`)
- [ ] Configurer Agora RTC Engine (`agora_rtc_engine`)
- [ ] Configurer Mapbox (`mapbox_maps_flutter`)
- [ ] Configurer Firebase Messaging (`firebase_messaging`)
- [ ] Implémenter l'authentification SMS OTP (citoyens)
- [ ] Implémenter l'authentification email/password (secouristes)
- [ ] Implémenter le heartbeat (30s)
- [ ] Implémenter la transmission GPS (10s pour secouristes)
- [ ] Écouter les appels entrants via Realtime (`call_history`)
- [ ] Écouter les dispatches via Realtime (`dispatches`)
- [ ] Implémenter le flux SOS complet (incident → call_queue → Agora)
- [ ] Implémenter la réception/acceptation de dispatch
- [ ] Implémenter la messagerie temps réel
- [ ] Implémenter les signalements avec médias
- [ ] Enregistrer/rafraîchir le token FCM
- [ ] Gérer l'interface d'appel native (CallKit/ConnectionService)
- [ ] Implémenter la mise à jour de position de l'unité
- [ ] Gérer le cycle de vie des incidents (statuts)
- [ ] Implémenter le nettoyage à la déconnexion (statut offline, suppression active_rescuers)

---

*Document généré automatiquement — Projet Étoile Bleue — 31 mars 2026*
