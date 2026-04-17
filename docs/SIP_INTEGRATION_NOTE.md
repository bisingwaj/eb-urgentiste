# 📝 Note Technique : Intégration des Appels SIP / PBX (Appel Normal)

Cette note détaille comment l'intégration SIP a été réalisée dans l'application mobile pour permettre aux urgentistes d'émettre des appels GSM (réseau mobile normal) vers les patients, via le serveur IPBX (PBX) de l'organisation. L'appel transite par internet (VoIP) de l'application vers l'IPBX, qui le redirige ensuite vers le réseau mobile local.

## 1. Stack Technique et Dépendances
L'intégration repose sur plusieurs librairies, adaptées pour fonctionner dans un écosystème React Native (Expo) :
- **`sip.js`** : Moteur SIP robuste en JavaScript.
- **`react-native-webrtc`** : Implémentation native de WebRTC (indispensable car SIP s'en sert pour négocier la session audio).
- **`react-native-incall-manager`** : Pour gérer la bascule matérielle de l'audio (Microphone, Haut-parleur vs Écouteur interne "earpiece") pendant l'appel.
- **`@config-plugins/react-native-webrtc`** : Plugin Expo injecté dans `app.json` pour configurer automatiquement les permissions requises sous Android (`RECORD_AUDIO`, `CAMERA`) et iOS.

## 2. Le Moteur d'Appel (`src/lib/sipCall.ts`)
Le fichier `sipCall.ts` gère toute la logique asynchrone d'authentification SIP et de session d'appel.

### A. Le Polyfill WebRTC
Puisque `sip.js` a été conçu pour les navigateurs web, il recherche par défaut les objets standards `window.RTCPeerConnection` et `navigator.mediaDevices`. React Native n'a pas ces objets d'origine. Les premières lignes du fichier "polyfillent" (injectent) donc les composants natifs de `react-native-webrtc` directement dans l'objet global :
```typescript
if (!global.window) { (global as any).window = {}; }
(global.window as any).RTCPeerConnection = RTCPeerConnection;
// ... (idem pour RTCSessionDescription, mediaDevices, etc.)
```

### B. Authentification sur l'IPBX
Avant chaque appel :
1. L'application récupère l'identifiant de l'utilisateur actif via `supabase.auth.getUser()`.
2. Elle interroge la table `profiles` pour récupérer l'extension PBX attitrée de cet urgentiste (`sip_extension`, `sip_password`). (Valeurs de fallback sur "1000", "admin" par sécurité).
3. Elle crée un `UserAgent` sip.js pointant vers le serveur : `wss://pbx.en-action.com/ws`.
4. Le `Registerer` est activé pour annoncer la présence du client au serveur IPBX.

### C. Émission de l'Appel & Formatage
Pour que l'IPBX puisse appeler le réseau public, le numéro du destinataire (patient) est assaini :
- Si le numéro commence par `+243` (format international), il est converti en format local commençant par `0` (obligatoire pour les règles de sortie du routeur PBX).
- Un objet `Inviter` est créé avec les contraintes d'avoir uniquement de l'audio : `{ constraints: { audio: true, video: false } }`.

### D. La Gestion Matérielle Audio
Nous écoutons l'évènement de l'inviter `stateChange` (Establishing, Terminated...).
- Quand l'appel commence (`Establishing`), on démarre le `InCallManager` :
  ```typescript
  InCallManager.start({ media: 'audio' });
  InCallManager.setForceSpeakerphoneOn(false); // Force le son dans l'écouteur classique
  ```
- Quand ça raccroche (`Terminated`), on stoppe le module avec `InCallManager.stop()` pour libérer le micro et l'interface audio de l'OS.

## 3. L'Interface Utilisateur (Interface Actus Mission)
Sur l'écran `MissionActiveScreen.tsx` :

- Le bouton **"Appel Normal (Passer par le réseau GSM)"** est substitué. Auparavant il exécutait la directive `Linking.openURL('tel:...')` pour ouvrir l'application téléphone native.
- Désormais, il déclenche silencieusement `startSipCall()`.
- Pour informer l'urgentiste et lui permettre de contrôler cet appel caché : un encart flottant (`sipBanner`) rouge est injecté via le state local `sipCallState`.
- Dès que l'appel a le statut `calling` ou `active`, cette bannière apparaît en haut de l'écran avec un bouton pour **"Raccrocher"** (qui appelle `endSipCall()`).

## Résumé
1. Urgentiste appuie sur "Appel Normal".
2. `useSipCall.startSipCall` est invoqué et polyfille WebRTC.
3. Requête backend pour choper l'extension.
4. Websocket SIP connectée, formatage du numéro.
5. InCallManager route le flux dans l'oreille.
6. L'UI React Native affiche le bouton de Raccrochage personnalisé.
