# 🏥 Flux Complet : Nouvelle Alerte (SignalementScreen)

Ce document détaille le parcours utilisateur (UX Flow) au sein de l'écran de gestion des missions, depuis la réception de l'alerte jusqu'à la clôture de l'intervention.

---

## 🎨 Design System & Esthétique
- **Style** : iOS Modern Dark Mode (Instagram/Facebook style).
- **Surface** : `#1C1C1E` (Dark Grey) sur fond `#000000` (Pure Black).
- **Accents** : Bleu iOS (`#0A84FF`), Vert Système (`#32D74B`), Rouge Critique (`#FF453A`).
- **Composants** : Bordures Glassmorphism, Squelettes de chargement pulsants, Waveform animé pour le vocal.

---

## 🛤️ Étapes du Flow (Workflow)

### 1. 📅 Liste des Alertes (`list`)
C'est le point d'entrée après avoir cliqué sur **"Nouvelle alerte"**.
- **Vue** : Liste verticale d'alertes en attente de dispatch.
- **Détails affichés** : Type d'urgence (Icone + Nom), ID unique, Priorité (Tag coloré), Temps écoulé, Localisation simplifiée.
- **Interaction** : Cliquer sur une carte ouvre les détails de cette mission spécifique.

### 2. 📥 Réception & Détails (`reception`)
Dossier complet de l'alerte avant acceptation.
- **Informations** :
    - **Mission** : Type, ID, Description textuelle du régulateur (CRRA).
    - **Lieu** : Adresse exacte avec bouton de prévisualisation cartographique.
    - **Patient** : Nom, Âge, Sexe, Groupe Sanguin, Antécédents, Allergies.
- **Actions** :
    - 🔴 **Décliner** : Envoie vers l'étape de justification du refus.
    - 🔵 **Accepter** : Lance la mission et active la navigation.

### 3. 🚫 Refus de Mission (`refusal`)
Étape obligatoire si la mission est déclinée.
- **Sélecteur** : Checkboxes (Distance, Équipement, Déjà en cours, Sécurité, etc.).
- **Notes** : Champ de saisie libre pour préciser la raison.
- **Action** : Bouton de confirmation rouge pour retourner à la liste.

### 4. 🚑 En Route vers Site (`enroute`)
Phase de déplacement d'urgence.
- **Vue** : Carte Mapbox (Style Dark-v11) plein écran.
- **Interface** : Overlay vitré montrant le point de destination, le temps estimé (ETA) et le type d'urgence.
- **Action** : Bouton **"ARRIVÉE SUR PLACE"** dès que l'unité est à destination.

### 5. 🩺 Intervention sur Place (`intervention`)
L'étape la plus critique où l'urgentiste remplit le dossier médical.
- **État du Patient** : 3 boutons larges (**Conscient / Inconscient / Décès**).
- **Bilan Clinique** : Saisie textuelle détaillée des observations médicales.
- **Multimédia** : Boutons pour joindre des **Photos**, **Vidéos** ou **Documents**.
- **Vocal** : Simulation d'enregistrement de bilan audio avec timer et waveform animé.
- **Actions Finales** :
    - 🟠 **Évacuer** : Si le patient nécessite un transport vers l'hôpital.
    - 🟢 **Terminer** : Si le patient est traité sur place ou si la mission s'arrête ici.

### 6. 🏥 Transport Hospitalier (`transport`)
Phase d'évacuation vers une structure de soins.
- **Vue** : Carte montrant l'itinéraire vers l'hôpital cible (ex: Clinique Ngaliema).
- **Action** : Bouton **"ADMISSION TERMINÉE"** une fois le patient remis à l'équipe hospitalière.

### 7. ✅ Clôture & Synchronisation (`closure`)
Écran de succès final.
- **Iconographie** : Halo de succès vert pulsant.
- **Statut** : Confirmation que toutes les données (bilan écrit, vocal, médias) sont synchronisées avec le centre de régulation.
- **Action** : Retour à l'écran d'accueil de l'application.

---

## 🛠️ Composants Techniques Spéciaux
- **SyncOverlay** : Une surcouche de synchronisation simulée (ActivityIndicator) s'affiche entre chaque changement d'étape majeur pour renforcer l'aspect "temps réel".
- **Waveform Component** : Animation purement visuelle basée sur `Animated.View` pour donner une impression de professionnalisme durant le bilan vocal.
- **SkeletonItem** : Utilisé au démarrage de l'écran pour éviter les flashs de contenu vide.
