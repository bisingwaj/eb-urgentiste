# 📋 Instructions pour Lovable — App Citoyen (SOS)
## Corrections pour l'envoi correct de la localisation

---

## Contexte

L'app citoyen est la **source primaire** de toutes les données de localisation. Quand un citoyen envoie un SOS, l'incident est créé dans Supabase avec ses coordonnées GPS. **Le problème actuel** : le champ `location_address` est souvent `NULL`, ce qui empêche l'urgentiste de voir l'adresse du patient sur son écran d'intervention.

---

## 🔴 Problème n°1 : `location_address` est NULL

### Ce qui se passe actuellement

L'app citoyen fait probablement quelque chose comme :

```typescript
// ❌ PROBLÈME : pas de reverse geocoding avant l'envoi
await supabase.from('incidents').insert({
  location_lat: position.coords.latitude,
  location_lng: position.coords.longitude,
  location_address: null,  // ← NULL ! L'urgentiste ne verra PAS d'adresse
  type: 'medical',
  priority: 'critical',
  ...
});
```

### ✅ Ce qu'il faut faire

**AVANT** d'insérer l'incident, faire un **reverse geocoding** pour transformer les coordonnées GPS en adresse lisible :

```typescript
// ✅ CORRECTION : Reverse geocoding AVANT l'INSERT

// 1. Obtenir la position GPS du citoyen
const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
const { latitude, longitude } = location.coords;

// 2. Transformer les coordonnées en adresse textuelle
let locationAddress = null;
try {
  const [geocode] = await Location.reverseGeocodeAsync({ latitude, longitude });
  if (geocode) {
    // Construire l'adresse la plus complète possible
    const parts = [
      geocode.name,                                    // Ex: "Hôpital Mama Yemo"
      [geocode.streetNumber, geocode.street].filter(Boolean).join(" "),  // Ex: "42 Av. Lumumba"
      geocode.district,                                // Ex: "Lemba"
      geocode.city,                                    // Ex: "Kinshasa"
      geocode.subregion !== geocode.city ? geocode.subregion : null,
      geocode.region !== geocode.city ? geocode.region : null,
    ].filter(Boolean);
    
    // Supprimer les doublons (ex: "Kinshasa" qui apparait dans city ET region)
    const uniqueParts = [...new Set(parts)];
    locationAddress = uniqueParts.join(", ");
  }
} catch (e) {
  console.warn("Reverse geocoding échoué, envoi sans adresse:", e);
  // On continue quand même avec NULL — le trigger SQL remplira la commune
}

// 3. Insérer l'incident avec l'adresse remplie
await supabase.from('incidents').insert({
  location_lat: latitude,
  location_lng: longitude,
  location_address: locationAddress,  // ← Ex: "42 Av. Lumumba, Lemba, Kinshasa"
  type: 'medical',
  priority: 'critical',
  caller_name: userName,
  caller_phone: userPhone,
  ...
});
```

> **Résultat** : L'urgentiste verra immédiatement `"42 Av. Lumumba, Lemba, Kinshasa"` sur son écran au lieu de `"Adresse inconnue"`.

---

## 🔴 Problème n°2 : Position temps réel (`caller_realtime_lat/lng`)

### Pourquoi c'est important

Après l'envoi du SOS, le citoyen peut **se déplacer** (il panique, il va chercher de l'aide, etc.). L'urgentiste a besoin de savoir **où le citoyen se trouve MAINTENANT**, pas où il était il y a 5 minutes.

### ✅ Ce qu'il faut faire

**APRÈS** l'insertion de l'incident, démarrer un **tracking en temps réel** qui met à jour `caller_realtime_lat` et `caller_realtime_lng` toutes les 5 à 10 secondes :

```typescript
// ✅ Après l'INSERT de l'incident, démarrer le suivi temps réel

const incidentId = insertedIncident.id; // L'ID retourné par l'INSERT

// Démarrer le tracking GPS continu
const locationSubscription = await Location.watchPositionAsync(
  {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,       // Toutes les 5 secondes
    distanceInterval: 5,      // Ou tous les 5 mètres
  },
  async (newLocation) => {
    const { latitude, longitude } = newLocation.coords;
    
    // Mettre à jour la position temps réel dans Supabase
    await supabase
      .from('incidents')
      .update({
        caller_realtime_lat: latitude,
        caller_realtime_lng: longitude,
        caller_realtime_updated_at: new Date().toISOString(),
      })
      .eq('id', incidentId);
    
    console.log(`📡 Position victime mise à jour: ${latitude}, ${longitude}`);
  }
);

// IMPORTANT : Arrêter le tracking quand l'incident est résolu
// (quand le citoyen ferme l'app ou que l'incident passe en "resolved")
// locationSubscription.remove();
```

### Quand arrêter le tracking ?

```typescript
// Écouter le statut de l'incident pour arrêter le tracking
const channel = supabase
  .channel(`incident-status-${incidentId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'incidents',
    filter: `id=eq.${incidentId}`,
  }, (payload) => {
    const status = payload.new.status;
    if (['resolved', 'cancelled', 'completed'].includes(status)) {
      // Incident terminé → arrêter le tracking
      locationSubscription.remove();
      channel.unsubscribe();
      console.log("✅ Tracking position arrêté — incident résolu");
    }
  })
  .subscribe();
```

---

## 🟡 Amélioration : Écran d'attente du citoyen

Pendant que le citoyen attend l'urgentiste, afficher sur son écran :

```
┌─────────────────────────────────────┐
│  🆘 SOS envoyé avec succès         │
│                                     │
│  📍 Votre position est partagée    │
│     en temps réel                   │
│                                     │
│  🚑 Un urgentiste est en route     │
│     ETA estimée : 4 min            │
│                                     │
│  ⚠️  Restez à votre position       │
│     si possible                     │
│                                     │
│  [Annuler le SOS]                  │
└─────────────────────────────────────┘
```

---

## Résumé des modifications pour l'app citoyen

| # | Action | Effort | Impact |
|---|---|---|---|
| 1 | **Reverse geocoding avant l'INSERT** — remplir `location_address` | 🟢 5 lignes de code | 🔴 CRITIQUE |
| 2 | **Tracking temps réel après le SOS** — MAJ `caller_realtime_lat/lng` toutes les 5s | 🟡 20 lignes de code | 🔴 CRITIQUE |
| 3 | **Arrêter le tracking** quand l'incident est résolu | 🟢 10 lignes de code | 🟡 Important |
| 4 | **Écran d'attente** avec statut de partage de position | 🟡 UI simple | 🟢 Nice to have |

---

## Schéma du flux corrigé (App Citoyen)

```
[Citoyen appuie sur SOS]
    │
    ├── 1. getCurrentPositionAsync() → lat, lng
    │
    ├── 2. reverseGeocodeAsync(lat, lng) → "42 Av. Lumumba, Lemba, Kinshasa"
    │
    ├── 3. INSERT incidents {
    │       location_lat: lat,
    │       location_lng: lng,
    │       location_address: "42 Av. Lumumba, Lemba, Kinshasa"  ← REMPLI !
    │     }
    │     └── Trigger auto_enrich_incident → commune auto-calculée
    │     └── Trigger on_incident_created → notification urgentiste
    │
    ├── 4. watchPositionAsync() → tracking continu
    │       │
    │       └── Toutes les 5s → UPDATE incidents {
    │             caller_realtime_lat: newLat,
    │             caller_realtime_lng: newLng,
    │             caller_realtime_updated_at: now()
    │           }
    │           └── L'urgentiste reçoit en Realtime la position actuelle
    │
    └── 5. Quand incident = "resolved" → tracking.remove()
```

> **Point clé** : La responsabilité de remplir `location_address` revient à l'app citoyen. Le trigger SQL `auto_enrich_incident` sert de filet de sécurité (commune), mais ne remplace pas un vrai reverse geocoding côté client.
