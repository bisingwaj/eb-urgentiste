# Appels mobile urgentiste ↔ centrale — Alignement avec l’architecture web

Document pour **l’app React Native / Expo** (`eb-urgentiste`), croisé avec la **référence backend & dashboard** :

- **`CALL_SYSTEM_ANALYSIS.md`** (racine du dépôt) — architecture complète : 5 flux, tables, Edge Functions, RLS, triggers, multi-lignes dashboard.

Les deux documents doivent être lus ensemble : **CALL_SYSTEM_ANALYSIS** = contrat global ; **ce fichier** = ce qui est réellement codé dans le client mobile et les écarts.

---

## 1. Cartographie des 5 flux (vue système)

| # | Flux | Signalisation principale | Côté mobile RN aujourd’hui |
|---|------|---------------------------|----------------------------|
| 1 | SOS citoyen → centre | `incidents` + `call_queue` + Agora | **Hors** cette app (rôle urgentiste / secouriste). |
| 2 | Dashboard → citoyen | `call_history` (`outgoing`, `citizen_id` cible) | **Hors** cette app (app citoyen Flutter / autre). |
| 3 | Inter-opérateurs | `operator_calls` | **Non** — dashboard uniquement. |
| 4 | **Secouriste → centrale** | `call_history` (`internal`, broadcast opérateurs) | **Implémenté** (`CallCenterScreen`) : INSERT + `agora-token` + Agora. |
| 5 | Secouriste → citoyen | Edge `rescuer-call-citizen` + `call_history` | **Non** — pas d’appel à cette Edge Function dans l’app actuelle. |

**Technologie commune** : Agora RTC ; App ID côté client via `EXPO_PUBLIC_AGORA_APP_ID` (même projet que dans CALL_SYSTEM_ANALYSIS §11).

---

## 2. Référence base de données (vue web)

Le schéma détaillé des colonnes, enums, triggers et politiques RLS est dans **`CALL_SYSTEM_ANALYSIS.md`** §2, §6, §7.

### 2.1 Rappel utile pour le routage « appel vers le secouriste »

Le backend / dashboard décrit le **même mécanisme** pour le citoyen et le secouriste : l’appel entrant est une ligne `call_history` avec **`citizen_id = auth.uid()` du destinataire** (nom historique de colonne ; pour un secouriste, c’est bien l’UUID du compte Supabase du terrain, **cf. CALL_SYSTEM_ANALYSIS §5.2**).

Tant que le mobile **n’écoute pas** les `INSERT` sur `call_history` filtrés ainsi, l’appel **centrale → secouriste** ne déclenchera pas d’UI (voir §6).

### 2.2 Formats de `channel_name` (documentation web vs code RN)

| Flux | Format documenté (CALL_SYSTEM_ANALYSIS §2.1) | Valeur actuelle dans `CallCenterScreen.tsx` |
|------|---------------------------------------------|---------------------------------------------|
| Interne secouriste | `INT-{caller_id_short}-{timestamp}` | **`OP-{timestamp}`** |

**Recommandation** : aligner le générateur mobile sur la convention **`INT-…`** (ou celle validée par l’équipe backend) pour que logs, support et outils de debug coïncident avec le dashboard. Le principe inchangé : **même chaîne** dans `call_history`, dans `agora-token` et dans `joinChannel`.

---

## 3. Edge Functions (référence web ↔ usage RN)

| Fonction | Rôle (CALL_SYSTEM_ANALYSIS §3) | Usage dans `eb-urgentiste` |
|----------|----------------------------------|---------------------------|
| `agora-token` | Génère token RTC | **`src/lib/agoraToken.ts`** — utilisé pour `joinAgoraChannel`. |
| `rescuer-call-citizen` | Appel secouriste → citoyen + INSERT `call_history` | **Non utilisé** dans le code actuel. |
| `startCloudRecording` / `stopCloudRecording` | Enregistrement cloud | **Non** — côté dashboard. |

---

## 4. Flux RN implémenté : secouriste → centrale (détail)

### 4.1 Navigation

1. `HomeTab` → `navigation.navigate('CallCenter')`.
2. Au montage de `CallCenterScreen`, **appel audio lancé automatiquement** (`initiateCall('audio')`).

### 4.2 Séquence

```
INSERT call_history (internal, ringing, channel_name, citizen_id = session.user.id, …)
   → invoke agora-token(channelName)
   → joinChannel(token, channelName)
   → Realtime UPDATE sur id = currentCallId (passage active / fin)
```

### 4.3 Ce que le dashboard web fait dans le même flux (CALL_SYSTEM_ANALYSIS §4.3)

- **Realtime** broadcast pour les opérateurs (`useInternalIncomingCalls`).
- **Claim** : premier opérateur qui fait `UPDATE` avec `operator_id` + `status = active`.
- **Timeout** ~45 s côté client web si personne ne décroche.

Le mobile urgentiste **n’implémente pas** le claim (il est côté opérateur) ; il se contente d’être **dans le canal Agora** et de réagir aux **UPDATE** sur **sa** ligne d’appel.

---

## 5. Temps réel Supabase (état du code RN)

| Événement | Implémenté ? | Où |
|-----------|---------------|-----|
| `UPDATE` `call_history` sur l’appel **en cours** (`id` connu) | **Oui** | `CallCenterScreen` — passage `active` / fin. |
| `INSERT` `call_history` où `citizen_id = auth.uid()` (appel **entrant** centrale → secouriste) | **Non** | Aucun listener global (cf. CALL_SYSTEM_ANALYSIS §5.2 / §10). |

---

## 6. Appels entrants « centre → secouriste » (workaround documenté)

**CALL_SYSTEM_ANALYSIS §10** indique : pas d’Edge Function dédiée ; **workaround** = `INSERT call_history` avec **`citizen_id` = `auth_user_id` du secouriste** (même pattern que pour le citoyen).

Pour que l’app RN **réagisse**, il faudra :

1. Souscrire aux **`INSERT`** sur `public.call_history` avec filtre `citizen_id=eq.<auth.uid()>` (et `status=ringing` selon le flux).
2. Ouvrir l’écran d’appel avec `id`, `channel_name`, et joindre Agora (`agora-token` ou `agora_token` si renseigné en base — **rescuer→citizen** utilise la colonne token ; pour le flux dashboard→secouriste, **vérifier** avec la backend si la ligne contient un token ou uniquement `agora-token`).

Prérequis Realtime : **`REPLICA IDENTITY FULL`** sur `call_history` — **CALL_SYSTEM_ANALYSIS §12**.

---

## 7. RLS (rappel pour le mobile)

Selon **CALL_SYSTEM_ANALYSIS §7**, pour `call_history` :

- **Secouriste** : en **SELECT**, des politiques peuvent exposer **plus** que « ses » lignes (`citizen_id = auth.uid()`) — le document web indique « tous les appels » pour le secouriste. **À valider** sur votre instance Supabase (les policies réelles priment).
- **INSERT / UPDATE** : ce que le client peut faire doit rester cohérent avec les tests d’intégration (claim opérateur, fin d’appel, etc.).

---

## 8. Fichiers sources mobile

| Fichier | Rôle |
|---------|------|
| `src/screens/urgentiste/CallCenterScreen.tsx` | UI appel, INSERT/UPDATE `call_history`, Realtime UPDATE, Agora. |
| `src/services/agoraRtc.ts` | Moteur Agora. |
| `src/lib/agoraToken.ts` | `agora-token`. |
| `src/lib/supabase.ts` | Client Supabase. |
| `src/contexts/AuthContext.tsx` | Session, `is_on_call` au sign out. |
| `App.tsx` / `HomeTab.tsx` | Navigation vers `CallCenter`. |

---

## 9. Synthèse pour l’équipe dashboard

| Question | Réponse |
|----------|---------|
| Référence architecture web / DB ? | **`CALL_SYSTEM_ANALYSIS.md`** (5 flux, tables, triggers, RLS, constantes). |
| L’app RN reçoit-elle un appel **initié** par la centrale ? | **Pas encore** — il manque l’écoute Realtime des **INSERT** (§6). |
| Appel **sortant** secouriste → centre | **Oui** — `call_history` + Agora ; `channel_name` actuellement `OP-{timestamp}` (§2.2). |
| Même `channel_name` partout ? | **Oui** — condition nécessaire pour rejoindre le même canal Agora. |

---

*Document mobile maintenu en parallèle de **`CALL_SYSTEM_ANALYSIS.md`**. En cas de divergence, valider avec le schéma SQL et les policies déployées sur Supabase.*
