# Appels mobile ↔ dashboard — Cadrage (avant développement)

Document de **discussion et d’alignement** entre **app React Native (secouriste)**, **dashboard web (Lovable)** et **backend Supabase**.

---

## État Lovable / dashboard (`useMultiCall.ts`) — retour équipe

Les **3 points** de la roadmap côté **dashboard** sont **implémentés** dans `useMultiCall.ts` (confirmé par Lovable, sans erreur TypeScript) :

| Point | Comportement décrit |
|-------|---------------------|
| **Sync vidéo Realtime** | Chaque ligne d’appel souscrit aux **UPDATE** `call_history` (par **`channel_name`**). Quand **`has_video`** passe à `true` (ex. côté mobile), le dashboard **détecte** et **met à jour l’UI** vidéo. |
| **Minuteur synchronisé** | Chrono basé sur **`answered_at`** : `elapsed = now() - answered_at`. **Fallback** sur compteur local si `answered_at` n’est pas encore dispo. |
| **Raccrochage rapide** | Détection **immédiate** des statuts terminaux (`completed`, `missed`, `failed`) via **Realtime** → fermeture automatique de la ligne, **sans** attendre le timeout Agora « user-left ». |
| **Nettoyage** | Souscriptions Realtime nettoyées en fin de ligne (`cleanupLine`, `endAllLines`). |

**Côté mobile RN** : aligner le comportement (timer sur `answered_at`, écoute `has_video` si l’opérateur allume la vidéo en premier, fin d’appel) reste **à faire ou à valider** dans `CallCenterScreen` — voir cases **mobile** dans les sections ci-dessous.

---

## 1. Passage en vidéo (mobile ↔ dashboard)

### Constat actuel (mobile)

- Le secouriste peut activer la vidéo pendant l’appel (`toggleVideoMode` dans `CallCenterScreen`).
- Une mise à jour **`has_video: true`** est envoyée sur `call_history` **à l’activation** de la vidéo.

### Ce qu’il faut pour que le « dash » suive

1. **Contrat unique** : la source de vérité est **`call_history.has_video`** (et éventuellement un champ explicite côté web si vous en ajoutez un, ex. `remote_wants_video` — à éviter si pas nécessaire).
2. **Dashboard** : s’abonner en **Realtime** aux **UPDATE** sur la ligne d’appel active (`call_history.id` connu dans la session d’appel) et, quand `has_video` passe à `true`, **passer l’UI opérateur en mode vidéo** (souscription caméra Agora, même `channel_name`, même token régénéré si votre logique l’exige).
3. **Symétrie** : si l’**opérateur** active la vidéo en premier, le mobile doit **recevoir** la même info (même colonne ou convention partagée) pour ouvrir la caméra — **à décider** : un seul booléen `has_video` suffit-il pour « au moins un côté en vidéo », ou faut-il `has_video_rescuer` / `has_video_operator` ? (Voir §7 « questions ouvertes ».)

### Note pour **Lovable / dashboard**

- [x] **Fait** (`useMultiCall`) : UPDATE `call_history` suivis par `channel_name` ; réaction à **`has_video`** pour l’UI vidéo.
- [ ] **Symétrie opérateur → mobile** : si l’opérateur coupe / allume la vidéo, le mobile doit toujours recevoir l’info (même colonne ou champ dédié) — **à confirmer** côté web si un **UPDATE** explicite est écrit dans tous les cas.

---

## 2. Minuteur désynchronisé

### Cause probable

- Chaque client affiche un **chrono local** démarré à l’entrée dans l’état « actif » (ex. `setInterval` côté mobile au passage `callState === 'active'`).
- Le dashboard fait de même de son côté, avec des **instants de référence différents** (latence réseau, moment du passage `ringing` → `active`, horloge locale).

### Approche recommandée (à valider)

1. **Source de vérité unique** : **`answered_at`** (ou `started_at` si vous ne distinguez pas sonnerie / décroché) sur `call_history`, renseigné **au moment où l’appel est considéré comme « actif »** (premier des deux qui décroche, ou règle métier unique).
2. **Affichage** : les deux clients calculent  
   `durée affichée = now() - answered_at` (avec correction timezone / UTC).
3. **Realtime** : dès qu’un `UPDATE` pose `answered_at` et `status = 'active'`, les deux UIs se **recalent** sur la même base.

### Note pour **Lovable**

- [x] **Fait** : affichage basé sur **`answered_at`** avec fallback local si absent (`useMultiCall`).

### Note **mobile**

- [ ] Remplacer (ou compléter) le timer basé sur `setInterval` pur par un calcul dérivé de **`answered_at`** lu depuis la ligne `call_history` (ou état synchronisé après Realtime) — **recommandé** pour matcher le dashboard.

---

## 3. Délai quand l’un raccroche (l’autre « comprend » en retard)

### Causes possibles

- Latence **Realtime** Supabase (ordre de grandeur : centaines de ms à quelques s selon charge).
- Le client qui raccroche met à jour la DB **après** avoir quitté Agora, ou l’autre client ne **poll** pas / n’a pas de listener sur le bon événement.
- Pas de message **« leave »** explicite sur le canal Agora avant l’UPDATE DB.

### Pistes (sans imposer l’ordre d’implémentation)

1. **Realtime** : les deux côtés écoutent les **UPDATE** sur `status` (`completed`, `failed`, `missed`) pour la ligne d’appel — **dashboard** : fait (`useMultiCall`) ; **mobile** : partiel sur la ligne courante.
2. **Optimistic UI** : quand l’utilisateur local raccroche, **couper l’UI immédiatement** ; l’UPDATE DB confirme pour l’autre partie.
3. **Événement Agora** : `onUserOffline` peut **compléter** la perception de fin de média (ne remplace pas la vérité métier en base pour l’historique).

### Note pour **Lovable**

- [x] **Fait** : statuts terminaux détectés via **Realtime**, fermeture de ligne sans attendre Agora (`useMultiCall`).

### Note **mobile**

- [ ] Listener **UPDATE** déjà partiel sur la ligne courante ; renforcer si besoin + **Agora** `onUserOffline` pour feedback média immédiat.

---

## 4. Design vidéo « type WhatsApp » (PIP, swap, déplacement, mini-fenêtre)

### Attentes exprimées

- Grille / plein écran **remote**, **local en PIP** ;
- **Échanger** les vues (remote ↔ local) ;
- **Déplacer** la carte vidéo locale ;
- **Réduire** l’appel en petite fenêtre pour **naviguer ailleurs** dans l’app (comme WhatsApp).

### Réalité technique (à accepter ou ajuster)

| Fonctionnalité | React Native / Agora | Commentaire |
|----------------|----------------------|-------------|
| Vue distante + locale (PIP) | Déjà proche avec `RtcSurfaceView` (uid distant + uid 0) | Affiner styles, coins, ombre. |
| Swap (inverser les deux) | **Faisable** en permutant quelle vue utilise quel `uid` / layout | Purement UI + état React. |
| Déplacer la carte (drag) | **Faisable** avec `PanResponder` ou librairie gesture sur la vue PIP | Effort moyen. |
| **Mini-fenêtre système** (appel par-dessus les autres apps / retour accueil) | **Android** : Picture-in-Picture (PIP) **natif** ou overlay ; **expo** peut nécessiter **config plugin** / module natif | Plus lourd ; souvent **hors scope** d’une première itération. |
| Naviguer **dans la même app** pendant l’appel | Options : **overlay global** (modal transparent), ou **stack** avec mini-player persistant — **refonte navigation** | À cadrer : risque régression sur missions / onglets. |

### Recommandation produit

- **Phase 1** : parité **visuelle** proche WhatsApp **dans** l’écran d’appel (layouts, boutons, swap, drag PIP) — sans PiP OS.
- **Phase 2** : **réduction** type WhatsApp **in-app** (bandeau ou bulle) si le produit l’exige.
- **Phase 3** : PiP **système** Android (et équivalent iOS si applicable).

---

## 5. Historique des appels sur le mobile

### Attente

- Voir dans l’app les **appels** (comme une liste type historique téléphonique).

### Côté données

- Filtrer **`call_history`** sur l’utilisateur connecté (`citizen_id = auth.uid()` **ou** autre colonne selon votre modèle secouriste — aligné avec **CALL_SYSTEM_ANALYSIS.md**).
- Afficher : date, durée, statut, type (audio/vidéo), sens si vous le stockez.

### Note pour **Lovable / backend**

- [ ] Confirmer les **RLS** : le secouriste peut-il **SELECT** ses lignes `call_history` pour historique ? (Le doc web mentionne des règles étendues — à vérifier en prod.)
- [ ] Si des champs manquent (ex. **libellé « centrale »** vs **numéro**), prévoir **colonnes** ou **vue** SQL dédiée pour l’historique mobile.

### Note **mobile**

- [ ] Nouvel écran ou section **« Historique des appels »** + requête paginée sur `call_history`.

---

## 6. Écran de **réception** d’appel (entrant centrale → secouriste)

### Constat

- Aujourd’hui **pas** d’écran « appel entrant » : pas d’écoute **INSERT** Realtime (voir `docs/APPELS_MOBILE_ET_DASHBOARD.md`).

### Note **mobile** (travaux futurs)

- [ ] Service global (ex. près du `AuthProvider` ou contexte dédié) : subscription **`INSERT`** `call_history` avec `citizen_id=eq.<auth.uid()>` et `status=ringing` (selon contrat dashboard).
- [ ] UI : plein écran **Accepter / Refuser** + sonnerie (respect OS / permissions).
- [ ] Après acceptation : `joinChannel` + alignement `answered_at` / statut `active`.

### Note pour **Lovable**

- [ ] Vérifier que l’**INSERT** depuis la centrale remplit bien **`citizen_id`**, **`channel_name`**, **`status`**, et éventuellement **`agora_token`** si le flux l’exige pour le mobile.

---

## 7. Questions ouvertes (réunion courte recommandée)

1. **Vidéo** : un seul booléen `has_video` ou **deux** états (rescuer / opérateur) ?
2. **Minuteur** : référence **`answered_at`** partagée — qui écrit la première transition `active` (mobile, web, ou trigger) ?
3. **Historique** : liste **uniquement** `call_history` ou aussi **`operator_calls`** pour les opérateurs (N/A sur l’app secouriste) ?
4. **WhatsApp-like** : valider **Phase 1–3** (§4) pour budget / délai.

---

## 8. Synthèse « qui fait quoi »

| Sujet | Lovable / Web / Backend | Mobile RN |
|-------|-------------------------|------------|
| Sync vidéo | **Fait** (`useMultiCall`) : UPDATE par `channel_name`, réaction à `has_video` | Envoie `has_video` ; **à faire** : réagir si l’opérateur allume la vidéo en premier (Realtime sur la ligne) |
| Minuteur | **Fait** : `answered_at` + fallback local | **À faire** : même logique que le dash (au lieu du seul `setInterval`) |
| Raccrochage rapide | **Fait** : statuts terminaux via Realtime | Partiel ; renforcer + `onUserOffline` optionnel |
| Historique | RLS + vues si besoin | Liste + requêtes |
| Appel entrant | INSERT cohérent depuis centrale | Listener INSERT + écran réception |
| UI vidéo « WhatsApp » | N/A (sauf parité UX souhaitée côté web) | Gestes, layout, phases §4 |

---

*Document vivant : à mettre à jour après décision produit / technique.*
