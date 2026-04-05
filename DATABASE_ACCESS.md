# 🔐 Accès Base de Données — PABX Étoile Bleue

> **⚠️ CONFIDENTIEL** — Ne partagez ce document qu'avec les membres autorisés de l'équipe.

---

## 1. API REST

| Paramètre | Valeur |
|---|---|
| **URL** | `https://npucuhlvoalcbwdfedae.supabase.co` |
| **Anon Key** (publique) | `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| **Service Role Key** | Voir secrets → `SUPABASE_SERVICE_ROLE_KEY` |

### Exemple cURL — Lire les incidents

```bash
curl -X GET \
  'https://npucuhlvoalcbwdfedae.supabase.co/rest/v1/incidents?select=*&limit=10' \
  -H 'apikey: EXPO_PUBLIC_SUPABASE_ANON_KEY' \
  -H 'Authorization: Bearer <USER_JWT_TOKEN>'
```

### Exemple cURL — Avec Service Role Key (accès admin)

```bash
curl -X GET \
  'https://npucuhlvoalcbwdfedae.supabase.co/rest/v1/users_directory?select=*' \
  -H 'apikey: <SUPABASE_SERVICE_ROLE_KEY>' \
  -H 'Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>'
```

---

## 2. SDK JavaScript / TypeScript

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://npucuhlvoalcbwdfedae.supabase.co',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY'
);

// Authentification
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'operateur@example.com',
  password: 'motdepasse'
});

// Lire des données
const { data: incidents } = await supabase
  .from('incidents')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(20);

// Insérer des données
const { data: newIncident } = await supabase
  .from('incidents')
  .insert({
    reference: 'SOS-2026-001',
    title: 'Urgence médicale',
    type: 'medical',
    caller_name: 'Jean Dupont',
    caller_phone: '+243999000111'
  })
  .select()
  .single();

// Écouter en temps réel
const channel = supabase
  .channel('incidents-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, (payload) => {
    console.log('Changement:', payload);
  })
  .subscribe();
```

### Dans le projet Lovable (déjà configuré)

```typescript
import { supabase } from "@/integrations/supabase/client";
```

---

## 3. Connexion PostgreSQL directe

| Paramètre | Valeur |
|---|---|
| **Host** | `db.npucuhlvoalcbwdfedae.supabase.co` |
| **Port** | `5432` |
| **Database** | `postgres` |
| **User** | `postgres` |
| **Password** | Voir secrets → `SUPABASE_DB_URL` |
| **SSL** | Requis (`sslmode=require`) |

### Chaîne de connexion

```
postgresql://postgres:<PASSWORD>@db.npucuhlvoalcbwdfedae.supabase.co:5432/postgres?sslmode=require
```

### Exemple psql

```bash
psql "postgresql://postgres:<PASSWORD>@db.npucuhlvoalcbwdfedae.supabase.co:5432/postgres?sslmode=require"
```

---

## 4. Configuration MCP pour Cursor / IDE

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--supabase-url",
        "https://npucuhlvoalcbwdfedae.supabase.co",
        "--access-token",
        "<SUPABASE_SERVICE_ROLE_KEY>"
      ]
    }
  }
}
```

> Remplacez `<SUPABASE_SERVICE_ROLE_KEY>` par la valeur du secret correspondant.

---

## 5. Edge Functions

| URL de base | `https://npucuhlvoalcbwdfedae.supabase.co/functions/v1/` |
|---|---|

### Fonctions disponibles

| Fonction | Description |
|---|---|
| `agora-token` | Génération de tokens Agora RTC |
| `agora-recording` | Gestion enregistrement cloud Agora |
| `create-user` | Création d'utilisateur (admin) |
| `complete-profile` | Complétion profil utilisateur |
| `send-call-push` | Notification push appel entrant |
| `send-reset-password` | Email de réinitialisation mot de passe |
| `elevenlabs-scribe-token` | Token transcription ElevenLabs |
| `twilio-verify` | Vérification OTP Twilio |
| `startCloudRecording` | Démarrer enregistrement cloud |
| `stopCloudRecording` | Arrêter enregistrement cloud |

### Exemple d'appel

```bash
curl -X POST \
  'https://npucuhlvoalcbwdfedae.supabase.co/functions/v1/agora-token' \
  -H 'Authorization: Bearer <USER_JWT_TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"channelName": "SOS-2026-001"}'
```

---

## 6. Secrets configurés

| Nom du secret | Usage |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Accès admin complet à la DB |
| `SUPABASE_DB_URL` | Connexion PostgreSQL directe |
| `SUPABASE_URL` | URL de l'instance |
| `SUPABASE_ANON_KEY` | Clé publique |
| `SUPABASE_PUBLISHABLE_KEY` | Clé publique (alias) |
| `AGORA_APP_CERTIFICATE` | Certificat Agora WebRTC |
| `AGORA_CUSTOMER_KEY` | Clé client Agora |
| `AGORA_CUSTOMER_SECRET` | Secret client Agora |
| `ELEVENLABS_API_KEY` | API ElevenLabs (transcription) |
| `RESEND_API_KEY` | API Resend (emails) |
| `TWILIO_ACCOUNT_SID` | SID compte Twilio |
| `TWILIO_AUTH_TOKEN` | Token auth Twilio |
| `TWILIO_VERIFY_SERVICE_SID` | SID service vérification Twilio |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Clé service Firebase |
| `FIREBASE_PROJECT_ID` | ID projet Firebase |
| `LOVABLE_API_KEY` | Clé API Lovable AI |

> Les valeurs des secrets sont accessibles dans **Lovable Cloud → Backend → Secrets**.

---

## 7. Storage (Buckets)

| Bucket | Public | Usage |
|---|---|---|
| `avatars` | ✅ Oui | Photos de profil des opérateurs |
| `incidents` | ✅ Oui | Médias liés aux incidents (photos, vidéos) |

### URL d'accès fichier

```
https://npucuhlvoalcbwdfedae.supabase.co/storage/v1/object/public/<bucket>/<path>
```

---

## 8. Tables principales

| Table | Description |
|---|---|
| `users_directory` | Annuaire opérateurs, secouristes, citoyens |
| `incidents` | Incidents et urgences sanitaires |
| `call_history` | Historique des appels SOS |
| `call_queue` | File d'attente des appels |
| `call_recordings` | Enregistrements audio des appels |
| `call_transcriptions` | Transcriptions des appels |
| `call_transfers` | Transferts d'appels entre opérateurs |
| `operator_calls` | Appels inter-opérateurs |
| `units` | Unités d'intervention (ambulances, etc.) |
| `dispatches` | Dispatches d'unités vers incidents |
| `active_rescuers` | Positions GPS des secouristes actifs |
| `health_structures` | Hôpitaux et structures sanitaires |
| `signalements` | Signalements citoyens |
| `signalement_media` | Médias des signalements |
| `signalement_notes` | Notes sur les signalements |
| `messages` | Messages opérateurs ↔ unités |
| `notifications` | Notifications utilisateurs |
| `blocked_users` | Citoyens bloqués |
| `sos_responses` | Réponses questionnaire SOS |

### Enums

| Enum | Valeurs |
|---|---|
| `call_status` | `ringing`, `active`, `completed`, `missed`, `failed` |
| `call_type` | `incoming`, `outgoing`, `internal` |
| `incident_priority` | `critical`, `high`, `medium`, `low` |
| `incident_status` | `new`, `dispatched`, `in_progress`, `resolved`, `archived`, `pending`, `en_route`, `arrived`, `investigating`, `ended` |
| `unit_status` | `available`, `dispatched`, `en_route`, `on_scene`, `returning`, `offline` |
| `user_role` | `citoyen`, `secouriste`, `call_center`, `hopital`, `volontaire`, `superviseur`, `admin` |

> Pour le schéma TypeScript complet, voir `src/integrations/supabase/types.ts`.

---

## 9. Fonctions SQL (Database Functions)

| Fonction | Description |
|---|---|
| `auto_assign_queue()` | Attribution auto des appels aux opérateurs disponibles |
| `cleanup_stale_queue_entries()` | Nettoyage des entrées file d'attente expirées |
| `is_citizen_blocked(p_citizen_id)` | Vérifier si un citoyen est bloqué |
| `handle_new_user()` | Trigger : créer profil à l'inscription |
| `on_incident_created()` | Trigger : mise en file d'attente automatique |
| `on_incident_resolved()` | Trigger : clôture file d'attente |
| `on_call_history_status_change()` | Trigger : synchronisation statut appel |
| `deduplicate_incident()` | Trigger : dédoublonnage incidents (30s) |
| `update_updated_at_column()` | Trigger : mise à jour timestamp |

---

## 10. Intégration App Mobile (Flutter / React Native)

```dart
// Flutter — pubspec.yaml : supabase_flutter: ^2.0.0
import 'package:supabase_flutter/supabase_flutter.dart';

await Supabase.initialize(
  url: 'https://npucuhlvoalcbwdfedae.supabase.co',
  anonKey: 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
);
```

```typescript
// React Native — npm install @supabase/supabase-js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://npucuhlvoalcbwdfedae.supabase.co',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY'
);
```

---

*Document généré le 31 mars 2026 — Projet PABX Étoile Bleue*
