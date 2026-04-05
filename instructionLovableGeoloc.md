📋 Instructions pour Lovable — Correction de l'affichage d'adresse
Contexte
L'app mobile urgentiste reçoit souvent location_address = NULL depuis la table incidents. Résultat : l'urgentiste ne voit pas l'adresse du patient et on doit faire un reverse geocoding côté mobile (qui est imprécis à Kinshasa).

La solution durable c'est que le backend remplisse location_address automatiquement.

✅ Ce que j'ai déjà corrigé côté mobile
✅ Récupération de caller_realtime_lat/lng et commune dans le SELECT
✅ Priorité caller_realtime_lat > location_lat pour la position temps réel
✅ Écoute Realtime sur la table incidents pour suivre la position victime
✅ Chaîne de fallback adresse : address → commune → reverse geocode → GPS
✅ Nettoyage des types et suppression du champ coordinates obsolète
🔴 Ce que Lovable DOIT modifier (Backend / Dashboard)
Action 1 : Remplir location_address automatiquement (CRITIQUE)
Quand un incident est créé avec des coordonnées GPS mais sans adresse, le backend doit faire un reverse geocoding serveur et remplir location_address.

Option A — Trigger SQL + Edge Function :

sql
-- Trigger AFTER INSERT sur incidents
CREATE OR REPLACE FUNCTION auto_geocode_address()
RETURNS TRIGGER AS $$
BEGIN
  -- Si location_address est NULL mais que les coordonnées existent
  IF NEW.location_address IS NULL AND NEW.location_lat IS NOT NULL THEN
    -- Appeler une Edge Function Supabase qui fait le reverse geocoding
    PERFORM net.http_post(
      url := 'https://votre-projet.supabase.co/functions/v1/reverse-geocode',
      body := json_build_object(
        'incident_id', NEW.id,
        'lat', NEW.location_lat,
        'lng', NEW.location_lng
      )::text,
      headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY"}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
Option B — Reverse geocoding dans l'app citoyen (plus simple) :

Dans l'app citoyen, AVANT d'envoyer le SOS :

typescript
// Avant l'INSERT dans incidents
const [geocode] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
const address = [
  geocode.streetNumber, 
  geocode.street, 
  geocode.district, 
  geocode.city
].filter(Boolean).join(", ");
// INSERT avec l'adresse remplie
await supabase.from('incidents').insert({
  location_lat: lat,
  location_lng: lng,
  location_address: address,  // ← OBLIGATOIRE : ne plus laisser NULL
  ...
});
Action 2 : Enrichir le trigger auto_enrich_incident
Le trigger actuel calcule déjà commune — c'est bien. Mais il devrait aussi :

sql
-- Ajouter dans le trigger auto_enrich_incident :
-- Si location_address est NULL, construire une adresse minimale
IF NEW.location_address IS NULL AND v_commune IS NOT NULL THEN
  NEW.location_address := 'Commune de ' || v_commune || ', Kinshasa';
END IF;
Cela garantit que même si l'app citoyen ne fait pas de reverse geocoding, l'urgentiste aura au minimum "Commune de Lemba, Kinshasa" au lieu de rien.

Action 3 : S'assurer que l'app citoyen envoie la position temps réel
Vérifier que l'app citoyen met bien à jour caller_realtime_lat et caller_realtime_lng toutes les 5-10 secondes après l'envoi du SOS. C'est ce que l'app urgentiste écoute maintenant en Realtime pour mettre à jour le marqueur de la victime sur la carte.

Résumé de la priorité
Action	Effort	Impact
Remplir location_address dans l'app citoyen	🟢 Facile	🔴 Critique
Enrichir trigger pour location_address = commune	🟢 Facile	🟡 Important
Edge Function reverse geocoding serveur	🟡 Moyen	🟢 Nice to have
Vérifier MAJ caller_realtime_lat/lng	🟢 Vérification	🟡 Important
IMPORTANT

La correction la plus simple et la plus impactante : faire un reverse geocoding dans l'app citoyen avant l'INSERT et remplir location_address. C'est littéralement 5 lignes de code.