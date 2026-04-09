/**
 * Contrat push pour que l’appel soit traité **hors application** (accueil, autre app, app tuée)
 * avec sonnerie + Notifee.
 *
 * D’après la doc Expo (« Headless Background Notification ») :
 * - Il faut un message **data-only** (pas de bloc `notification` seul sur Android), pour que
 *   `Notifications.registerTaskAsync` exécute le JS et affiche la notif locale / Notifee avec son.
 * - Sinon, avec un simple « Notification Message », l’OS affiche une notif mais **sans** exécuter
 *   la tâche JS en arrière-plan de la même façon — sonnerie / plein écran non garantis.
 *
 * Références :
 * - https://docs.expo.dev/push-notifications/what-you-need-to-know/#headless-background-notifications
 * - https://firebase.google.com/docs/cloud-messaging/concept-options#setting-the-priority-of-a-message
 *
 * Exemple **FCM HTTP v1** (à adapter côté serveur / Edge `send-call-push`) :
 *
 * ```json
 * {
 *   "message": {
 *     "token": "<FCM_TOKEN>",
 *     "android": {
 *       "priority": "HIGH",
 *       "ttl": "120s"
 *     },
 *     "apns": {
 *       "headers": {
 *         "apns-push-type": "background",
 *         "apns-priority": "5"
 *       },
 *       "payload": {
 *         "aps": {
 *           "content-available": 1
 *         }
 *       }
 *     },
 *     "data": {
 *       "type": "incoming_call",
 *       "callId": "<uuid>",
 *       "channelName": "<agora_channel>",
 *       "callerName": "Centrale",
 *       "hasVideo": "false"
 *     }
 *   }
 * }
 * ```
 */
export const INCOMING_CALL_FCM_DATA_KEYS = [
  'type',
  'callId',
  'channelName',
  'callerName',
  'hasVideo',
] as const;
