# Mise à jour des informations d'une structure sanitaire

> Guide d'implémentation pour ajouter la **modification (UPDATE)** d'une structure depuis l'application hospitalière (mobile / web hôpital).
> Backend : **Lovable Cloud (Supabase)** — Projet `npucuhlvoalcbwdfedae`.

---

## 1. Table cible : `public.health_structures`

### Schéma complet

| Colonne | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `uuid` | ❌ (PK) | `gen_random_uuid()` |
| `name` | `text` | ❌ | Nom affiché |
| `short_name` | `text` | ✅ | Sigle (ex: `HGK`) |
| `official_name` | `text` | ✅ | Nom officiel complet |
| `type` | `text` | ❌ | Enum textuel — voir ci-dessous |
| `lat` | `double precision` | ✅ | WGS84, -90 → 90 |
| `lng` | `double precision` | ✅ | WGS84, -180 → 180 |
| `address` | `text` | ❌ | Adresse postale |
| `phone` | `text` | ❌ | Format DRC : `+243…`, `243…`, `0…` |
| `email` | `text` | ✅ | |
| `capacity` | `integer` | ✅ | Lits totaux |
| `available_beds` | `integer` | ✅ | Lits disponibles ⭐ (champ le plus mis à jour) |
| `operating_hours` | `text` | ✅ | ex: `"24h/24"` |
| `specialties` | `text[]` | ✅ | Voir enum `UrgencyCategory` |
| `equipment` | `text[]` | ✅ | Liste libre |
| `is_open` | `boolean` | ✅ | Toggle Ouvert / Fermé |
| `contact_person` | `text` | ✅ | Nom du contact |
| `rating` | `numeric` | ✅ | 0–5 |
| `linked_user_id` | `uuid → users_directory.id` | ✅ | Compte hôpital propriétaire |
| `created_at` / `updated_at` | `timestamptz` | ❌ | Auto |

### Valeurs autorisées pour `type`

```
hopital | centre_sante | maternite | pharmacie | police | pompier | base_emu
```

### Valeurs autorisées pour `specialties[]` (UrgencyCategory)

```
cardiaque | traumatisme | brulure | obstetrique | pediatrie | intoxication |
psychiatrie | accident_route | agression | incendie | general
```

---

## 2. Politiques RLS en place (CRITIQUE)

```sql
-- SELECT : tous les utilisateurs authentifiés
SELECT  USING (true)

-- INSERT : seulement call_center / admin / superviseur
INSERT  WITH CHECK (get_user_role(auth.uid()) IN ('call_center','admin','superviseur'))

-- UPDATE : opérateurs OU le compte hôpital lié
UPDATE  USING (
  get_user_role(auth.uid()) IN ('call_center','admin','superviseur')
  OR is_linked_structure(id, auth.uid())
)

-- DELETE : admin uniquement
DELETE  USING (get_user_role(auth.uid()) = 'admin')
```

➡️ **Un compte `hopital` peut UPDATE uniquement la structure dont `linked_user_id` pointe vers son entrée `users_directory`.** Aucune action serveur supplémentaire n'est nécessaire — la fonction `is_linked_structure(structure_id, auth_uid)` filtre déjà.

### Définition de `is_linked_structure`
```sql
SELECT EXISTS (
  SELECT 1 FROM health_structures hs
  JOIN users_directory ud ON ud.id = hs.linked_user_id
  WHERE hs.id = p_structure_id AND ud.auth_user_id = p_user_id
)
```

---

## 3. Authentification côté app hôpital

L'app hôpital se connecte via l'Edge Function **`agent-login`** (login + PIN). Une session Supabase JWT est ensuite injectée dans le client. Toute requête `update` doit passer par le client Supabase authentifié — sinon RLS rejette.

```ts
import { supabase } from "@/integrations/supabase/client";
// session établie après agent-login → supabase.auth.setSession(...)
```

---

## 4. Implémentation côté app — exemple complet

### 4.1 Récupérer la structure liée au compte connecté

```ts
const { data: { user } } = await supabase.auth.getUser();

// Trouver l'id users_directory à partir de auth_user_id
const { data: dir } = await supabase
  .from("users_directory")
  .select("id, role")
  .eq("auth_user_id", user!.id)
  .maybeSingle();

if (dir?.role !== "hopital") throw new Error("Compte non hôpital");

// Charger la structure liée
const { data: structure, error } = await supabase
  .from("health_structures")
  .select("*")
  .eq("linked_user_id", dir.id)
  .maybeSingle();
```

### 4.2 Mettre à jour la structure

```ts
type StructureUpdate = Partial<{
  name: string;
  short_name: string | null;
  official_name: string | null;
  address: string;
  phone: string;
  email: string | null;
  contact_person: string | null;
  operating_hours: string | null;
  capacity: number | null;
  available_beds: number | null;
  is_open: boolean;
  lat: number | null;
  lng: number | null;
  specialties: string[];
  equipment: string[];
  // ⛔ Ne JAMAIS envoyer : id, linked_user_id, created_at, updated_at
}>;

async function updateMyStructure(structureId: string, updates: StructureUpdate) {
  // Validations client
  if (updates.lat != null && (updates.lat < -90 || updates.lat > 90))
    throw new Error("Latitude invalide");
  if (updates.lng != null && (updates.lng < -180 || updates.lng > 180))
    throw new Error("Longitude invalide");
  if (updates.phone && !/^(\+243|243|0)/.test(updates.phone.replace(/\s/g, "")))
    throw new Error("Téléphone DRC invalide (+243…)");
  if (updates.available_beds != null && updates.capacity != null
      && updates.available_beds > updates.capacity)
    throw new Error("Lits dispo > capacité totale");

  const { data, error } = await supabase
    .from("health_structures")
    .update(updates)
    .eq("id", structureId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

### 4.3 Cas d'usage prioritaire — toggle « Disponibilité lits »

C'est l'action la plus fréquente côté hôpital, à exposer en gros bouton dans l'UI :

```ts
await updateMyStructure(structure.id, {
  available_beds: newCount,
  is_open: newCount > 0,
});
```

---

## 5. Champs verrouillés (ne pas exposer à l'édition)

| Champ | Raison |
|---|---|
| `id` | Clé primaire |
| `linked_user_id` | Géré par le dashboard centrale (génération d'accès) |
| `type` | Catégorisation administrative — réservée aux admins |
| `created_at` / `updated_at` | Gérés en base |
| `rating` | Calculé / réservé admin |

➡️ Si l'app hôpital tente quand même : RLS l'autorise (le check est par ligne, pas par colonne), mais convention métier = **ne pas afficher dans le formulaire**. Pour forcer côté serveur, créer un trigger `BEFORE UPDATE` similaire à `protect_sensitive_user_fields`.

### (Optionnel) Trigger de protection des champs sensibles

```sql
CREATE OR REPLACE FUNCTION public.protect_structure_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF get_user_role(auth.uid()) NOT IN ('admin','superviseur','call_center') THEN
    IF NEW.linked_user_id IS DISTINCT FROM OLD.linked_user_id THEN
      RAISE EXCEPTION 'Seul un admin peut modifier le compte lié';
    END IF;
    IF NEW.type IS DISTINCT FROM OLD.type THEN
      RAISE EXCEPTION 'Seul un admin peut modifier le type de structure';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_structure_admin_fields
BEFORE UPDATE ON public.health_structures
FOR EACH ROW EXECUTE FUNCTION public.protect_structure_admin_fields();
```

---

## 6. Realtime (optionnel — recommandé)

Le dashboard de la centrale affiche les lits dispo en temps réel. Pour propager les changements :

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.health_structures;
```

Côté app :
```ts
supabase
  .channel("my-structure")
  .on("postgres_changes",
    { event: "UPDATE", schema: "public", table: "health_structures",
      filter: `id=eq.${structure.id}` },
    payload => setStructure(payload.new))
  .subscribe();
```

---

## 7. UI recommandée pour l'app hôpital

**Écran « Ma Structure » avec sections collapsibles :**

1. 🟢 **Disponibilité** (gros bouton toggle `is_open` + stepper `available_beds`/`capacity`)
2. 📞 **Contact** (`phone`, `email`, `contact_person`)
3. 📍 **Adresse & GPS** (`address`, `lat`, `lng` — avec sélecteur carte)
4. 🕐 **Horaires** (`operating_hours`)
5. 🩺 **Spécialités** (multi-select à puces — voir enum)
6. 🔧 **Équipements** (liste éditable, ajout/suppression)

**Bouton « Enregistrer »** → `updateMyStructure(...)` puis toast succès.

---

## 8. Erreurs courantes & debug

| Erreur Supabase | Cause | Solution |
|---|---|---|
| `new row violates row-level security policy` | Pas authentifié OU `linked_user_id` pointe vers un autre compte | Vérifier session + `linked_user_id == users_directory.id` du user |
| `permission denied for table health_structures` | Rôle anon utilisé | Forcer `supabase.auth.setSession(...)` après `agent-login` |
| Update silencieux sans erreur, mais `data` est `null` | Le filtre `.eq("id", …)` ne matche aucune ligne visible par RLS | La structure n'est pas liée à ce compte |

---

## 9. Référence rapide — Endpoint REST équivalent

Si tu utilises `fetch` plutôt que le SDK :

```http
PATCH https://npucuhlvoalcbwdfedae.supabase.co/rest/v1/health_structures?id=eq.<UUID>
apikey: <ANON_KEY>
Authorization: Bearer <USER_JWT>
Content-Type: application/json
Prefer: return=representation

{
  "available_beds": 12,
  "is_open": true,
  "phone": "+243815591234"
}
```

---

**TL;DR pour Antigravity** :
1. `UPDATE public.health_structures SET … WHERE id = <linked_structure_id>` via le SDK Supabase authentifié.
2. RLS autorise déjà le rôle `hopital` à modifier sa propre structure (via `is_linked_structure`).
3. Ne pas exposer `id`, `type`, `linked_user_id` à l'édition.
4. Cibler en priorité `available_beds`, `is_open`, `phone`, `operating_hours`.
