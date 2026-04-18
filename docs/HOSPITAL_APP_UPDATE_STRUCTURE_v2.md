# 🏥 Mise à jour de la fiche structure — App Hôpital (v2)

> **v2 — Diagnostic & fix erreur « colonnes manquantes »**
> Cette version corrige le bug où l'app affiche un message générique masquant la vraie erreur PostgreSQL.

---

## ⚠️ Diagnostic du bug actuel

L'app mobile affiche :
> *« Impossible de mettre à jour le profil. Certaines colonnes sont peut-être manquantes dans votre base de données. »*

**Ce message est FAUX.** Le schéma DB est correct et complet. La vraie cause est l'une de ces 3 :

| # | Cause | Fix |
|---|---|---|
| 1 | L'app envoie un **champ verrouillé** (`name`, `address`, `lat`, `lng`, `type`, `official_name`, `linked_user_id`) avec une valeur différente | Appliquer la **whitelist stricte** §4 |
| 2 | L'app envoie un **champ inexistant** en DB (ex: `description`, `website`, `services`) | Appliquer la **whitelist stricte** §4 |
| 3 | L'app **masque l'erreur PostgreSQL** réelle | Afficher `error.message` brut §6 |

---

## 1. Schéma `public.health_structures` (référence officielle)

```ts
{
  id: uuid;                    // PK
  name: string;                // 🔒 readonly (admin only)
  official_name: string|null;  // 🔒 readonly
  short_name: string|null;     // ✏️ editable
  type: 'hopital'|'centre_sante'|'maternite'|'pharmacie'|'police'|'pompier'|'base_emu'; // 🔒 readonly
  address: string;             // 🔒 readonly
  lat: number|null;            // 🔒 readonly
  lng: number|null;            // 🔒 readonly
  phone: string;               // ✏️ editable
  email: string|null;          // ✏️ editable
  contact_person: string|null; // ✏️ editable
  operating_hours: string|null;// ✏️ editable
  is_open: boolean;            // ✏️ editable
  capacity: number;            // ✏️ editable
  available_beds: number;      // ✏️ editable
  specialties: string[];       // ✏️ editable
  equipment: string[];         // ✏️ editable
  rating: number|null;         // 🔒 (avis)
  linked_user_id: uuid|null;   // 🔒 readonly
  updated_at: timestamptz;
  created_at: timestamptz;
}
```

> ❌ **Champs INEXISTANTS en DB** (ne PAS les envoyer) : `description`, `website`, `services`, `notes`, `beds`, `total_beds`, `is_active`, `status`.

---

## 2. Récupérer la fiche

```ts
async function fetchMyStructure() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');

  const { data: profile } = await supabase
    .from('users_directory')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();

  const { data: structure, error } = await supabase
    .from('health_structures')
    .select('*')
    .eq('linked_user_id', profile.id)
    .single();

  if (error) throw error;
  return structure;
}
```

---

## 3. ✅ Whitelist stricte (CRITIQUE)

```ts
// ⚠️ NE JAMAIS envoyer d'autres champs que ceux-ci.
const EDITABLE_FIELDS = [
  'short_name',
  'phone',
  'email',
  'contact_person',
  'operating_hours',
  'is_open',
  'capacity',
  'available_beds',
  'specialties',
  'equipment',
] as const;

type EditableField = typeof EDITABLE_FIELDS[number];
type EditableStructurePatch = Partial<Pick<HealthStructure, EditableField>>;
```

---

## 4. Update défensif (à utiliser tel quel)

```ts
async function updateMyStructure(
  structureId: string,
  patch: Record<string, any>
) {
  // 1️⃣ Filtre STRICT : on ne garde que les champs whitelistés ET définis
  const safePatch: Record<string, any> = {};
  for (const key of EDITABLE_FIELDS) {
    if (patch[key] !== undefined) {
      safePatch[key] = patch[key];
    }
  }

  // 2️⃣ Validation client : available_beds <= capacity
  if (
    typeof safePatch.available_beds === 'number' &&
    typeof safePatch.capacity === 'number' &&
    safePatch.available_beds > safePatch.capacity
  ) {
    throw new Error('Le nombre de lits libres ne peut pas dépasser la capacité totale.');
  }

  // 3️⃣ Garde-fou : refuse si payload vide
  if (Object.keys(safePatch).length === 0) {
    throw new Error('Aucun champ modifiable à mettre à jour.');
  }

  // 4️⃣ DEBUG : log ce qui part réellement (à retirer en prod)
  console.log('[updateMyStructure] payload envoyé →', safePatch);

  const { data, error } = await supabase
    .from('health_structures')
    .update(safePatch)
    .eq('id', structureId)
    .select()
    .single();

  if (error) {
    // 5️⃣ Log brut de l'erreur Supabase (CRUCIAL pour debug)
    console.error('[updateMyStructure] Supabase error →', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  return data;
}
```

---

## 5. 🗺️ Mapping des erreurs DB → messages utilisateur

Remplacez le message générique « Certaines colonnes sont peut-être manquantes » par ce mapping :

```ts
function mapStructureUpdateError(error: any): string {
  const msg = (error?.message ?? '').toLowerCase();

  // Trigger protect_structure_admin_fields
  if (msg.includes("ne peuvent pas modifier l'adresse")) {
    return "L'adresse ne peut être modifiée que par un administrateur.";
  }
  if (msg.includes('ne peuvent pas modifier le nom')) {
    return "Le nom officiel ne peut être modifié que par un administrateur.";
  }
  if (msg.includes('ne peuvent pas modifier les coordonnées') || msg.includes('lat') || msg.includes('lng')) {
    return "Les coordonnées GPS ne peuvent être modifiées que par un administrateur.";
  }
  if (msg.includes('ne peuvent pas modifier le type')) {
    return "Le type de structure ne peut être modifié que par un administrateur.";
  }
  if (msg.includes('ne peuvent pas modifier')) {
    // Fallback pour tout autre champ verrouillé
    return error.message; // garde le message FR du trigger
  }

  // Erreurs PostgREST classiques
  if (error?.code === 'PGRST204' || msg.includes("could not find the") || msg.includes('column')) {
    return "Champ inconnu envoyé au serveur. Contactez le support technique.";
  }
  if (error?.code === '42703') {
    return "Colonne inexistante : " + (error.message || 'détail inconnu');
  }
  if (msg.includes('row-level security') || error?.code === '42501') {
    return "Vous n'êtes pas autorisé à modifier cette structure.";
  }
  if (msg.includes('violates check constraint')) {
    return "Une valeur invalide a été saisie (vérifiez les champs numériques).";
  }

  // Fallback : NE PAS masquer le message DB → l'afficher tel quel
  return error?.message ?? 'Erreur inconnue lors de la mise à jour.';
}
```

### Usage

```ts
try {
  await updateMyStructure(structureId, formValues);
  toast.success('Profil mis à jour');
} catch (e) {
  toast.error(mapStructureUpdateError(e));
}
```

---

## 6. 🐛 Si le bug persiste — checklist debug

1. **Vérifier le payload réel** envoyé : ajouter `console.log('[payload]', safePatch)` juste avant l'`update`.
2. **Vérifier la console** : chercher le `[updateMyStructure] Supabase error →` — il contient la cause exacte.
3. **Erreurs typiques observées** :
   - `Could not find the 'description' column` → l'app envoie `description` (n'existe pas).
   - `Les hôpitaux ne peuvent pas modifier l'adresse (admin uniquement)` → l'app renvoie `address` avec une valeur ≠ de l'originale.
   - `new row violates row-level security policy` → l'utilisateur n'est pas `linked_user_id` de cette structure.
4. **Test isolé** : appeler manuellement `updateMyStructure(id, { is_open: true })` — si ça marche, le bug est dans le payload du formulaire.

---

## 7. 🛡️ Sécurité — triple verrou

| Couche | Protection |
|---|---|
| **RLS UPDATE** | `is_linked_structure(id, auth.uid())` → seul l'hôpital lié peut UPDATE |
| **Trigger BEFORE UPDATE** | `protect_structure_admin_fields()` → bloque la modif des champs admin |
| **Client (whitelist)** | `EDITABLE_FIELDS` filtre le payload AVANT envoi |

---

## 8. ✅ Checklist QA

- [ ] La constante `EDITABLE_FIELDS` est respectée à la lettre.
- [ ] `console.log` du payload activé pendant le test.
- [ ] Le toast d'erreur affiche le message DB **réel** (pas le générique).
- [ ] Les champs verrouillés sont en lecture seule dans l'UI (icône 🔒).
- [ ] Validation `available_beds <= capacity` côté client.
- [ ] Toggle `is_open` testé en isolation.
- [ ] Update partiel testé (envoyer un seul champ à la fois).

---

## 9. 📞 Support

Si l'erreur persiste après application de cette v2, fournir au support :
- Le `console.log` du payload exact envoyé
- L'objet `error` complet (`code`, `message`, `details`, `hint`)
- L'`id` de la structure concernée
