# 🚑 Étoile Bleue - Portail Urgentiste & Hôpital (Mobile)

Bienvenue sur le dépôt d'**Étoile Bleue (Mobile)**. Il s'agit de l'application "Mission-Critical" dédiée aux Sapeurs-Pompiers, Médecins Urgentistes et services d'Accueil Hospitalier.
L'application permet d'intercepter les alertes de la centrale, gérer son statut (standby) et remonter le parcours médical d'urgence en temps réel.

---

## 🛠 Tech Stack
- **Framework** : React Native (Expo SDK 54 / `expo-router`)
- **Base de données / Auth** : Supabase (PostgreSQL, Realtime, Edge Functions)
- **Carte & GPS** : RNMapbox
- **Appels & Visio** : Agora SDK (`react-native-agora`)

---

## 🚀 Démarrage Rapide (First-Time Setup)

Ce projet nécessite un environnement de développement mobile robuste (React Native / Expo). Voici les étapes standards pour initialiser l'environnement, que vous soyez sur macOS, Windows ou Linux.

### 1. Prérequis & Outils

1. **Node.js (LTS)** : Assurez-vous d'avoir une version LTS de Node.js installée.
2. **Java Development Kit (JDK 17+)** : Requis pour la compilation de l'application Android.
   - Installez le JDK depuis Oracle ou via votre gestionnaire de paquets.
   - Vérifiez l'installation dans votre terminal : `java -version`. L'intégration d'Android Studio échouera sans cela.
3. **Environnements Natifs** :
   - **Pour iOS (macOS uniquement)** : Installez **Xcode** via l'App Store ou l'Apple Developer Platform. Assurez-vous d'installer les *Command Line Tools*.
   - **Pour Android (Cross-platform)** : Installez **Android Studio**. Configurez le SDK Android et vos variables système (`ANDROID_HOME`, `JAVA_HOME`).

### 2. Configuration du Projet

1. **Cloner et installer les dépendances** :
   ```bash
   git clone git@github.com:bisingwaj/eb-urgentiste.git
   cd eb-urgentiste
   npm install
   ```

2. **Setup des Variables d'Environnement** :
   L'application interagit avec Supabase et des SDK externes (Mapbox, Agora).
   ```bash
   cp .local.env.example .local.env
   ```
   *Remplissez impérativement le fichier `.local.env` avec toutes vos clés.*

### 3. Lancer l'Application (Device Physique vs Virtuel)

> [!TIP]  
> **Recommandation de Développement** : 
> Les émulateurs virtuels peuvent consommer énormément de RAM. Pour une boucle de développement très rapide et fluide, **nous recommandons fortement l'utilisation d'un téléphone physique**.

**Option A : Appareil Physique via Expo Go (Recommandée)**
1. Téléchargez l'application **Expo Go** sur vote mobile (App Store / Google Play).
2. Vérifiez que votre mobile et votre ordinateur sont sur le même réseau local (Wi-Fi).
3. Lancez le serveur local : `npx expo start --clear`
4. Scannez le **QR Code** qui s'affiche dans votre terminal via Expo Go (Android) ou l'appareil photo (iOS).

**Option B : Dispositif Virtuel (Émulateur)**
1. Ouvrez initialement votre émulateur via Android Studio (AVD Manager) ou votre simulateur iOS via Xcode.
2. Lancez le serveur local : `npx expo start`
3. Appuyez sur la touche `a` (Android) ou `i` (iOS) dans le terminal pour y lancer l'application.

---

## 📂 Architecture de la Documentation

La documentation métier approfondie a été rationalisée pour éviter la surcharge cognitive lors de votre intégration. Toutes les documentations de référence se trouvent dans le dossier `docs/` :

- `docs/APPELS_MOBILE_ET_DASHBOARD.md` : Fonctionnement global de l'interface métier.
- `docs/HOSPITAL_APP_INTEGRATION.md` & `FLOW_NOUVELLE_ALERTE.md` : Logique de routage des alertes.
- `docs/PLAN_ACTION_MIGRATION.md` : Suivi technique.
- `docs/archive/` : Historique des prompts IA et des notes d'idéation brutes pour référence archéologique.

Bon courage pour votre intégration dans l'équipe d'Étoile Bleue !
