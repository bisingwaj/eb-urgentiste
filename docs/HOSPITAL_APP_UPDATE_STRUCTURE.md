# 🏥 Mise à jour de la fiche structure — App Hôpital

Guide d'implémentation pour Antigravity.

---

## 1. Contexte

Une structure sanitaire (`public.health_structures`) est liée à un compte utilisateur via `linked_user_id`. Le compte hôpital connecté peut **mettre à jour sa propre fiche**, mais avec des restrictions.

### 🔒 Règle métier (appliquée par trigger DB `trg_protect_structure_admin_fields`)

| Champ | Édition Hôpital | Édition Dashboard (admin/call_center) |
|---|---|---|
| `name` | ❌ Lecture seule | ✅ |
| `official_name` | ❌ Lecture seule | ✅ |
| `address` | ❌ Lecture seule | ✅ |
| `lat`, `lng` | ❌ Lecture seule | ✅ |
| `type` (catégorie) | ❌ Lecture seule | ✅ |
| `linked_user_id` | ❌ Lecture seule | ✅ |
| `short_name` | ✅ | ✅ |
| `phone` | ✅ | ✅ |
| `email` | ✅ | ✅ |
| `contact_person` | ✅ | ✅ |
| `operating_hours` | ✅ | ✅ |
| `is_open` | ✅ | ✅ |
| `available_beds` | ✅ | ✅ |
| `capacity` | ✅ | ✅ |
| `specialties` (text[]) | ✅ | ✅ |
| `equipment` (text[]) | ✅ | ✅ |

⚠️ Toute tentative d'update sur un champ verrouillé renvoie une erreur PostgreSQL explicite (ex : `Les hôpitaux ne peuvent pas modifier l'adresse (admin uniquement)`). **Ne pas envoyer ces champs dans le payload.**

---

## 2. Schéma de la table `public.health_structures`

```ts
{
  id: uuid;                    // PK
  name: string;                // 🔒 readonly
  official_name: string|null;  // 🔒 readonly
  short_name: string|null;     // ✏️ editable
  type: 'hopital'|'centre_sante'|'maternite'|'pharmacie'|'police'|'pompier'|'base_emu'; // 🔒 readonly
  address: string;             // 🔒 readonly
  lat: number|null;            // 🔒 readonly
  lng: number|null;            // 🔒 readonly
  phone: string;               // ✏️ editable
  email: string|null;          // ✏️ editable
  contact_person: string|null; // ✏️ editable
  operating_hours: string|null;// ✏️ editable (ex: "24h/24", "08h-18h")
  is_open: boolean;            // ✏️ editable (true = ouvert maintenant)
  capacity: number;            // ✏️ editable (lits totaux)
  available_beds: number;      // ✏️ editable (lits libres)
  specialties: string[];       // ✏️ editable (cf. enum ci-dessous)
  equipment: string[];         // ✏️ editable (libre)
  rating: number|null;         // 🔒 (géré par les avis)
  linked_user_id: uuid|null;   // 🔒 readonly
  updated_at: timestamptz;
  created_at: timestamptz;
}
```

### Valeurs `specialties` recommandées

```
cardiaque, traumatisme, brulure, obstetrique, pediatrie,
intoxication, psychiatrie, accident_route, agression, incendie, general
```

---

## 3. Récupérer la fiche de l'hôpital connecté

```ts
import { supabase } from '@/integrations/supabase/client';

async function fetchMyStructure() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');

  // 1. Trouver le profil dans users_directory
  const { data: profile } = await supabase
    .from('users_directory')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();

  // 2. Charger la structure liée
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

## 4. Mettre à jour les champs autorisés

⚠️ **N'envoyer QUE les champs éditables.** Sinon le trigger DB rejette la requête.

```ts
type EditableStructureFields = {
  short_name?: string | null;
  phone?: string;
  email?: string | null;
  contact_person?: string | null;
  operating_hours?: string | null;
  is_open?: boolean;
  capacity?: number;
  available_beds?: number;
  specialties?: string[];
  equipment?: string[];
};

async function updateMyStructure(
  structureId: string,
  patch: EditableStructureFields
) {
  // Liste blanche stricte côté client
  const ALLOWED = [
    'short_name','phone','email','contact_person',
    'operating_hours','is_open','capacity','available_beds',
    'specialties','equipment'
  ] as const;

  const safePatch = Object.fromEntries(
    Object.entries(patch).filter(([k]) => ALLOWED.includes(k as any))
  );

  const { data, error } = await supabase
    .from('health_structures')
    .update(safePatch)
    .eq('id', structureId)
    .select()
    .single();

  if (error) {
    // Erreurs typiques :
    // - "Les hôpitaux ne peuvent pas modifier l'adresse..." → un champ readonly a été envoyé
    // - "new row violates row-level security policy" → user non lié à cette structure
    throw error;
  }
  return data;
}
```

### Exemple : MAJ rapide des lits disponibles

```ts
await updateMyStructure(structureId, {
  available_beds: 12,
  is_open: true,
});
```

---

## 5. UI recommandée (Flutter / mobile)

### Section « Informations administratives » (lecture seule)
Afficher avec icône cadenas 🔒 :
- Nom (`name`)
- Nom officiel (`official_name`)
- Type (`type`) — afficher le label localisé
- Adresse (`address`)
- Coordonnées GPS (`lat`, `lng`) + bouton « Voir sur la carte »

> Footer : *« Pour modifier ces informations, contactez l'administrateur du Centre Étoile Bleue. »*

### Section « Coordonnées » (éditable)
- `short_name` (TextField)
- `phone` (TextField, validation +243...)
- `email` (TextField, validation email)
- `contact_person` (TextField — nom du référent)

### Section « Disponibilité » (éditable, mise à jour fréquente)
- `is_open` (Switch « Structure ouverte »)
- `operating_hours` (TextField, ex : `24h/24`)
- `capacity` (NumberField — lits totaux)
- `available_beds` (NumberField — lits libres, max = `capacity`)

### Section « Capacités médicales » (éditable)
- `specialties` (MultiSelect chips parmi l'enum)
- `equipment` (Tag input libre — ex: `Scanner`, `IRM`, `Défibrillateur`)

### Bouton d'action
`[Enregistrer les modifications]` → appel `updateMyStructure(...)` → toast succès/erreur.

---

## 6. Realtime (optionnel mais recommandé)

Pour refléter en temps réel les modifs faites depuis le dashboard :

```ts
const channel = supabase
  .channel(`structure:${structureId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'health_structures',
    filter: `id=eq.${structureId}`,
  }, (payload) => {
    setStructure(payload.new);
  })
  .subscribe();
```

---

## 7. Checklist QA

- [ ] L'utilisateur ne peut soumettre que les champs éditables (filtrage côté client + DB).
- [ ] Les champs verrouillés sont visibles avec une icône cadenas et un texte d'aide.
- [ ] La validation `available_beds <= capacity` est faite côté client.
- [ ] Le toggle `is_open` met à jour instantanément (optimistic UI + rollback en cas d'erreur).
- [ ] Les erreurs DB (trigger) sont affichées proprement à l'utilisateur (français).
- [ ] Le compte n'est pas autorisé à éditer une autre structure (testé en changeant manuellement l'`id`).

---

## 8. Sécurité — résumé

| Couche | Protection |
|---|---|
| **RLS UPDATE policy** | `is_linked_structure(id, auth.uid())` → seul l'hôpital lié peut UPDATE sa fiche |
| **Trigger BEFORE UPDATE** | `protect_structure_admin_fields()` → bloque la modif des champs admin |
| **Client (whitelist)** | Filtrage du payload avant envoi (UX) |

Triple verrouillage : même si le client triche, la DB rejette.
