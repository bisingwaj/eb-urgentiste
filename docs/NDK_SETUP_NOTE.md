# 🔧 Configuration NDK — Action requise après `git pull`

**Date :** 17 avril 2026  
**Auteur :** Emmanuel  
**Commit :** `0473325` — *fix android local.properties*

---

## 📌 Le problème

On avait un conflit récurrent sur la version du NDK Android :

- **Mac** utilise le **NDK 27** (`27.0.12077973`)
- **Windows** utilise le **NDK 26** (`26.1.10909125`)

À chaque pull/push, la ligne `android.ndkVersion` dans les fichiers Gradle changeait, créant des diffs inutiles et des conflits.

---

## ✅ Ce qui a changé

La version du NDK **n'est plus hardcodée** dans les fichiers Gradle.  
Elle est maintenant **lue depuis `android/local.properties`**, un fichier **gitignorée** (donc propre à chaque machine).

### Fichiers modifiés :

| Fichier | Avant | Après |
|---|---|---|
| `android/build.gradle` | `ndkVersion = "26.1.10909125"` | Lit `ndk.version` depuis `local.properties` |
| `android/app/build.gradle` | `ndkVersion "26.1.10909125"` | `ndkVersion rootProject.ext.ndkVersion` |

> **Fallback par défaut :** Si `ndk.version` n'est pas défini dans `local.properties`, le build utilisera `26.1.10909125` (NDK 26).

---

## 🚀 Ce que vous devez faire (équipe Mac)

Après avoir fait `git pull`, ouvrez le fichier `android/local.properties` et ajoutez-y cette ligne :

```properties
ndk.version=27.0.12077973
```

Votre fichier `local.properties` devrait ressembler à ceci :

```properties
sdk.dir=/Users/VOTRE_NOM/Library/Android/sdk
ndk.version=27.0.12077973
```

> ⚠️ Remplacez `27.0.12077973` par la version exacte de votre NDK si elle est différente.  
> Pour vérifier votre version installée :
> ```bash
> ls ~/Library/Android/sdk/ndk/
> ```

---

## 📁 Résumé

| Développeur | OS | NDK | Ligne à ajouter dans `local.properties` |
|---|---|---|---|
| Emmanuel | Windows | 26 | `ndk.version=26.1.10909125` |
| Équipe Mac | macOS | 27 | `ndk.version=27.0.12077973` |

**Plus besoin de toucher aux fichiers Gradle. Zéro conflit git.** ✌️
