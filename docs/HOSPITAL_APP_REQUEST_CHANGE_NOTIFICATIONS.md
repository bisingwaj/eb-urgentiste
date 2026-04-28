# Notifications hôpital — Annulation / Redirection d'une demande d'admission

## Contexte

Lorsqu'un urgentiste sur le terrain change d'avis et **annule** sa demande
d'admission ou la **redirige vers un autre hôpital**, l'hôpital initialement
sollicité doit en être informé en temps réel — sinon la demande disparaît
silencieusement de son flux.

Un trigger Postgres `trg_notify_hospital_on_structure_change` est désormais
attaché à la table `dispatches`. À chaque changement de
`assigned_structure_id`, il :

1. Insère une ligne dans `public.notifications` destinée à l'utilisateur lié
   à l'**ancien** hôpital (`health_structures.linked_user_id`).
2. Trace l'événement dans `dispatch_timeline`.
3. Empile un événement push (`push.hospital_request_change`) dans `outbox_events`.

Les 3 tables impliquées (`notifications`, `dispatches`, `dispatch_timeline`)
sont déjà publiées sur `supabase_realtime` → la notification arrive
instantanément côté client abonné.

## Schéma de la notification

Table : `public.notifications`

| Champ          | Valeur                                                                |
|----------------|-----------------------------------------------------------------------|
| `user_id`      | `auth_user_id` du compte hôpital initial                              |
| `type`         | `hospital_request`                                                    |
| `title`        | `Demande d'admission annulée` ou `Demande redirigée`                  |
| `message`      | Texte explicite contenant la référence incident et les noms d'hôpitaux |
| `reference_id` | `dispatches.id` (la mission concernée)                                |
| `is_read`      | `false`                                                                |
| `created_at`   | `now()`                                                                |

Deux cas distincts :

- **Annulation pure** : `assigned_structure_id` passe de `<uuid>` → `NULL`.
  Title = `Demande d'admission annulée`.
- **Redirection** : `assigned_structure_id` passe de `<uuid_A>` → `<uuid_B>`.
  Title = `Demande redirigée`. Le message indique le nouvel établissement.

## Intégration temps réel — App hôpital

### 1. Souscription realtime aux notifications

```ts
import { supabase } from "@/integrations/supabase/client";

const userId = (await supabase.auth.getUser()).data.user?.id;

const channel = supabase
  .channel(`hospital-notifications-${userId}`)
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "notifications",
      filter: `user_id=eq.${userId}`,
    },
    (payload) => {
      const n = payload.new as {
        id: string;
        title: string;
        message: string;
        type: string;
        reference_id: string | null;
      };

      if (n.type === "hospital_request") {
        // 1. Toast / bannière visible
        showToast({ title: n.title, description: n.message, variant: "warning" });

        // 2. Retirer la mission du flux des demandes en cours
        if (n.reference_id) {
          removeDispatchFromInbox(n.reference_id);
        }

        // 3. Refetch de la liste pour rester cohérent
        queryClient.invalidateQueries({ queryKey: ["hospital", "incoming-requests"] });
      }
    },
  )
  .subscribe();

return () => {
  supabase.removeChannel(channel);
};
```

### 2. Souscription complémentaire sur `dispatches`

Pour rafraîchir instantanément la liste des demandes affichées, écouter
aussi les `UPDATE` sur les dispatches qui ciblaient cet hôpital :

```ts
supabase
  .channel(`hospital-dispatches-${hospitalStructureId}`)
  .on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "dispatches",
    },
    (payload) => {
      const oldRow = payload.old as { assigned_structure_id?: string | null };
      const newRow = payload.new as { id: string; assigned_structure_id?: string | null };

      // Cette mission était chez nous et ne l'est plus
      if (
        oldRow.assigned_structure_id === hospitalStructureId &&
        newRow.assigned_structure_id !== hospitalStructureId
      ) {
        removeDispatchFromInbox(newRow.id);
        queryClient.invalidateQueries({ queryKey: ["hospital", "incoming-requests"] });
      }
    },
  )
  .subscribe();
```

> **Note** : `dispatches` est en `REPLICA IDENTITY FULL` dans ce projet
> (règle core), donc `payload.old` contient bien `assigned_structure_id`.

### 3. Récupération initiale (au montage)

Compléter le realtime par un fetch initial des notifications non lues :

```ts
const { data } = await supabase
  .from("notifications")
  .select("id, title, message, type, reference_id, created_at, is_read")
  .eq("user_id", userId)
  .eq("type", "hospital_request")
  .eq("is_read", false)
  .order("created_at", { ascending: false })
  .limit(50);
```

### 4. Marquer comme lu

```ts
await supabase
  .from("notifications")
  .update({ is_read: true })
  .eq("id", notificationId);
```

## Push notifications (background)

Le trigger empile aussi un événement `push.hospital_request_change` dans
`outbox_events` (priorité 3). Le worker `outbox-dispatcher` doit router cet
event vers FCM si l'on souhaite réveiller l'app hôpital quand elle est en
arrière-plan.

Payload :

```json
{
  "dispatch_id": "uuid",
  "incident_id": "uuid",
  "old_structure_id": "uuid",
  "new_structure_id": "uuid | null",
  "old_hospital_user_id": "uuid",
  "event_type": "hospital_request_cancelled | hospital_request_redirected",
  "title": "...",
  "message": "..."
}
```

À implémenter côté `outbox-dispatcher` : un handler qui, sur ce type
d'event, lit le `fcm_token` de `old_hospital_user_id` et envoie un push
data-only (pour réveil background, pattern déjà utilisé sur `push.call`).

## QA — Cas à tester

1. Urgentiste sélectionne hôpital A → A reçoit la demande.
2. Urgentiste annule → **A reçoit notification "Demande d'admission annulée"**,
   la ligne disparaît de son flux temps réel.
3. Urgentiste sélectionne ensuite hôpital B → B reçoit une nouvelle demande
   normalement.
4. Variante : urgentiste passe directement de A à B (sans annuler) →
   **A reçoit notification "Demande redirigée vers B"**.
5. Vérifier que la `dispatch_timeline` contient bien
   `hospital_request_cancelled` ou `hospital_request_redirected`.
