Note Technique : Intégration VoIP (Appel Sortant PBX) sur React Native
Contexte : Ajout de la fonctionnalité d'appel IP-to-Mobile via notre IPBX Grandstream. L'urgentiste cliquera sur un bouton existant dans l'application pour appeler la victime. L'appel doit passer par le PBX (SIP) qui routera vers le réseau GSM.
Environnement : React Native (Expo avec Prebuild / Bare workflow).

1. Dépendances requises
Le projet nécessite l'installation des paquets suivants pour le support WebRTC et la gestion audio native :

npx expo install react-native-webrtc

npm install react-native-incall-manager

npm install sip.js

2. Configuration Expo (app.json / app.config.js)
Ajouter le plugin WebRTC pour gérer automatiquement les permissions natives lors du prebuild :

JSON
"plugins": [
  [
    "@config-plugins/react-native-webrtc",
    {
      "cameraPermission": "Nécessaire pour les appels vidéo d'urgence.",
      "microphonePermission": "Nécessaire pour communiquer avec les victimes."
    }
  ]
]
(Action requise : Lancer npx expo prebuild --clean après l'ajout).

3. Infrastructure et Connexion SIP
Notre IPBX est exposé derrière un proxy sécurisé (Nginx + SSL). Aucun port spécifique n'est requis dans l'URL.

Domaine SIP : pbx.en-action.com

WSS Server : wss://pbx.en-action.com/ws

4. Implémentation : Le Service SIP
Créer un service ou un hook (useSipCall) qui sera déclenché par le bouton d'appel existant.

A. Le Polyfill WebRTC (Obligatoire)
Avant d'initialiser sip.js, il faut injecter WebRTC dans l'espace global pour simuler un navigateur :

JavaScript
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices } from 'react-native-webrtc';
window.RTCPeerConnection = RTCPeerConnection;
window.RTCIceCandidate = RTCIceCandidate;
window.RTCSessionDescription = RTCSessionDescription;
if (!navigator.mediaDevices) { navigator.mediaDevices = mediaDevices; }
B. Logique de l'Agent SIP

Récupérer les identifiants : Le username (extension) et le password SIP de l'urgentiste connecté (via Supabase ou le state global).

Normaliser le numéro : Le numéro de la victime doit être formaté pour la route de sortie du PBX (ex: remplacer +243 par 0).

Initialiser l'Agent :

Configurer UserAgent avec transportOptions: { server: 'wss://pbx.en-action.com/ws' }.

Désactiver la vidéo par défaut dans sessionDescriptionHandlerFactoryOptions.

Connecter et Inviter : Utiliser registerer.register() puis new Inviter(userAgent, targetURI) pour lancer l'appel.

C. Routage Audio (InCallManager)

Sur l'événement Establishing (quand ça sonne) : Déclencher InCallManager.start({ media: 'audio' }) et InCallManager.setForceSpeakerphoneOn(false) pour forcer le son sur l'écouteur interne (earpiece).

Sur l'événement Terminated (raccroché) : Déclencher InCallManager.stop() pour libérer l'audio.