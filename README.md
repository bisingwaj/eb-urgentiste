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

Ce projet nécessite une configuration d'environnement minutieuse. Si vous utilisez macOS, des précautions spécifiques sont à prendre pour éviter les pertes de temps.

### 1. Prérequis & Outils

#### 🍎 Utilisateurs macOS (Attention requise)
L'installation sur macOS peut s'avérer fastidieuse si votre machine n'est pas récente (ex: Mac de 2017 sous Ventura).
- **Xcode** : Le dernier Xcode de l'App Store ne s'installera probablement pas sur les anciens OS. **Ne forcez pas la mise à jour**. Rendez-vous sur le site [Apple Developer Downloads](https://developer.apple.com/download/all/) pour télécharger manuellement l'archive `.xip` de la version d'Xcode compatible avec votre version exacte de macOS (ex: Xcode 14.x pour Ventura).
- **Java (JDK)** : Requis absolu pour compiler la partie Android sur votre Mac.
  1. Installez Java depuis le site officiel d'Oracle.
  2. Ouvrez le terminal et tapez `java -version`. 
  3. **Vérification** : La commande DOIT retourner une version valide (ex: `java version "17.0.x"`). Si la commande échoue, l'application Android ne se compilera pas.

#### 🪟🐧 Utilisateurs Windows / Linux
- Un environnement Node.js valide (LTS).
- [Android Studio](https://developer.android.com/studio) avec le SDK Android configuré dans vos variables d'environnement (ex: `ANDROID_HOME`).
- Java (JDK) installé et accessible via `java -version`.

### 2. Configuration du Projet

1. **Cloner et installer les dépendances** :
   ```bash
   git clone git@github.com:bisingwaj/eb-urgentiste.git
   cd eb-urgentiste
   npm install
   ```

2. **Setup des Variables d'Environnement** :
   L'application dépend massivement de Supabase et de clés externes (Mapbox, Agora).
   ```bash
   cp .local.env.example .local.env
   ```
   *Remplissez le fichier `.local.env` avec vos clés secrètes d'environnement.*

### 3. Lancer l'Application (Device Physique Recommandé)

> [!WARNING]  
> **Avertissement de Performance** : 
> L'utilisation d'un émulateur Android ou du Simulateur iOS natif consomme énormément de RAM et ralentira excessivement les ordinateurs (particulièrement les anciens Mac).

**Méthode recommandée : Appareil externe via Expo Go**
Pour un retour visuel ultra-rapide et tester l'application dans des conditions réelles (ex: Samsung Galaxy S20 Ultra, iPhone) :

1. Téléchargez l'application **Expo Go** sur votre téléphone marin (disponible sur [App Store](https://apps.apple.com/app/expo-go/id982107779) / [Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)).
2. Connectez votre téléphone au même réseau Wi-Fi que votre ordinateur.
3. Lancez le serveur local :
   ```bash
   npx expo start --clear
   ```
4. Scannez le **QR Code** qui s'affiche dans votre terminal avec l'appareil photo de votre téléphone (ou directement dans l'app Expo Go sur Android).

---

## 📂 Architecture de la Documentation

La documentation métier approfondie a été rationalisée pour éviter la surcharge cognitive lors de votre intégration. Toutes les documentations de référence se trouvent dans le dossier `docs/` :

- `docs/APPELS_MOBILE_ET_DASHBOARD.md` : Fonctionnement global de l'interface métier.
- `docs/HOSPITAL_APP_INTEGRATION.md` & `FLOW_NOUVELLE_ALERTE.md` : Logique de routage des alertes.
- `docs/PLAN_ACTION_MIGRATION.md` : Suivi technique.
- `docs/archive/` : Historique des prompts IA et des notes d'idéation brutes pour référence archéologique.

Bon courage pour votre intégration dans l'équipe d'Étoile Bleue !
