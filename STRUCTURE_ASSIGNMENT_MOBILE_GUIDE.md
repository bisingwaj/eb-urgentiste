# Guide d'intégration mobile — Assignation de structure sanitaire

> **Version** : 1.0 — 4 avril 2026
> **Contexte** : Quand un opérateur du dashboard assigne une structure sanitaire (hôpital, pharmacie, maternité…) à une intervention, les coordonnées et informations de cette structure sont persistées sur la table `dispatches` et propagées en temps réel via Supabase Realtime aux applications mobiles (urgentiste + citoyen).

---

## 1. Schéma SQL — Nouvelles colonnes sur `dispatches`

```sql
-- Colonnes ajoutées (dénormalisées pour lecture directe sans jointure)
assigned_structure_id       uuid              -- ID de la structure dans health_structures
assigned_structure_name     text              -- Nom de la structure
assigned_structure_lat      double precision  -- Latitude GPS
assigned_structure_lng      double precision  -- Longitude GPS
assigned_structure_phone    text              -- Téléphone de la structure
assigned_structure_address  text              -- Adresse complète
assigned_structure_type     text              -- Type: hopital, pharmacie, maternite, clinique, centre_sante
```

### Pourquoi dénormalisé ?

- Le mobile n'a **pas besoin de faire une jointure** avec `health_structures`
- Les données sont immédiatement disponibles dans le payload Realtime
- Pas de foreign key pour éviter les problèmes de suppression de structure

---

## 2. Payload JSON reçu via Realtime

Quand l'opérateur clique "Assigner & Envoyer", le mobile reçoit un `UPDATE` sur `dispatches` avec ce payload :

```json
{
  "eventType": "UPDATE",
  "table": "dispatches",
  "schema": "public",
  "new": {
    "id": "dispatch-uuid",
    "incident_id": "incident-uuid",
    "unit_id": "unit-uuid",
    "status": "on_scene",
    "assigned_structure_id": "structure-uuid",
    "assigned_structure_name": "Hôpital Général de Kinshasa",
    "assigned_structure_lat": -4.3250,
    "assigned_structure_lng": 15.3222,
    "assigned_structure_phone": "+243812345678",
    "assigned_structure_address": "Avenue de la Libération, Gombe",
    "assigned_structure_type": "hopital",
    "updated_at": "2026-04-04T18:30:00Z"
  },
  "old": {
    "assigned_structure_id": null
  }
}
```

### Détection de l'assignation

L'assignation est détectée quand :
```dart
payload.newRecord['assigned_structure_id'] != null &&
payload.oldRecord['assigned_structure_id'] == null
```

---

## 3. Listener Realtime — Application urgentiste (Flutter/Dart)

### 3.1 Service d'écoute

```dart
// lib/services/structure_assignment_service.dart

import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class StructureAssignmentService {
  final SupabaseClient _supabase;
  final FlutterLocalNotificationsPlugin _notifications;
  RealtimeChannel? _channel;

  StructureAssignmentService(this._supabase, this._notifications);

  /// Commence à écouter les assignations de structure pour un dispatch donné
  void listenForStructureAssignment({
    required String dispatchId,
    required String incidentId,
    required Function(StructureAssignment) onAssigned,
  }) {
    _channel?.unsubscribe();

    _channel = _supabase
        .channel('structure-assignment-$dispatchId')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'dispatches',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: dispatchId,
          ),
          callback: (payload) {
            final newData = payload.newRecord;
            final oldData = payload.oldRecord;

            // Détecter une nouvelle assignation de structure
            if (newData['assigned_structure_id'] != null &&
                oldData['assigned_structure_id'] == null) {
              
              final assignment = StructureAssignment(
                structureId: newData['assigned_structure_id'],
                name: newData['assigned_structure_name'] ?? 'Structure',
                lat: (newData['assigned_structure_lat'] as num).toDouble(),
                lng: (newData['assigned_structure_lng'] as num).toDouble(),
                phone: newData['assigned_structure_phone'],
                address: newData['assigned_structure_address'],
                type: newData['assigned_structure_type'] ?? 'hopital',
              );

              // Notification locale
              _showAssignmentNotification(assignment);

              // Callback pour mise à jour UI
              onAssigned(assignment);
            }
          },
        )
        .subscribe();
  }

  Future<void> _showAssignmentNotification(StructureAssignment assignment) async {
    await _notifications.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      '🏥 Structure assignée',
      'Dirigez-vous vers ${assignment.name} — ${assignment.address ?? ""}',
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'structure_assignment',
          'Assignation structure',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(
          presentAlert: true,
          presentSound: true,
        ),
      ),
    );
  }

  void dispose() {
    _channel?.unsubscribe();
  }
}

/// Modèle de données pour une assignation de structure
class StructureAssignment {
  final String structureId;
  final String name;
  final double lat;
  final double lng;
  final String? phone;
  final String? address;
  final String type;

  StructureAssignment({
    required this.structureId,
    required this.name,
    required this.lat,
    required this.lng,
    this.phone,
    this.address,
    required this.type,
  });

  Map<String, dynamic> toJson() => {
    'structureId': structureId,
    'name': name,
    'lat': lat,
    'lng': lng,
    'phone': phone,
    'address': address,
    'type': type,
  };
}
```

### 3.2 Intégration dans le Provider d'intervention

```dart
// Dans votre InterventionProvider ou MissionProvider existant

class InterventionProvider extends ChangeNotifier {
  StructureAssignment? _assignedStructure;
  StructureAssignment? get assignedStructure => _assignedStructure;

  late final StructureAssignmentService _structureService;

  void startListeningStructure(String dispatchId, String incidentId) {
    _structureService.listenForStructureAssignment(
      dispatchId: dispatchId,
      incidentId: incidentId,
      onAssigned: (assignment) {
        _assignedStructure = assignment;
        notifyListeners();
      },
    );
  }

  /// Ouvrir la navigation GPS vers la structure
  Future<void> navigateToStructure() async {
    if (_assignedStructure == null) return;

    final lat = _assignedStructure!.lat;
    final lng = _assignedStructure!.lng;
    final name = Uri.encodeComponent(_assignedStructure!.name);

    // Google Maps
    final googleUrl = 'google.navigation:q=$lat,$lng&mode=d';
    // Waze
    final wazeUrl = 'waze://?ll=$lat,$lng&navigate=yes';
    // Fallback web
    final webUrl = 'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng';

    if (await canLaunchUrl(Uri.parse(googleUrl))) {
      await launchUrl(Uri.parse(googleUrl));
    } else if (await canLaunchUrl(Uri.parse(wazeUrl))) {
      await launchUrl(Uri.parse(wazeUrl));
    } else {
      await launchUrl(Uri.parse(webUrl));
    }
  }
}
```

### 3.3 Widget UI urgentiste

```dart
// lib/widgets/structure_assignment_card.dart

class StructureAssignmentCard extends StatelessWidget {
  final StructureAssignment structure;
  final VoidCallback onNavigate;
  final VoidCallback? onCall;

  const StructureAssignmentCard({
    required this.structure,
    required this.onNavigate,
    this.onCall,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.blue.shade50,
      margin: const EdgeInsets.all(12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(_getTypeIcon(), color: Colors.blue.shade700, size: 24),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        structure.name,
                        style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                      if (structure.address != null)
                        Text(
                          structure.address!,
                          style: TextStyle(
                            color: Colors.grey.shade600,
                            fontSize: 12,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'Coordonnées: ${structure.lat.toStringAsFixed(5)}, ${structure.lng.toStringAsFixed(5)}',
              style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: onNavigate,
                    icon: const Icon(Icons.navigation),
                    label: const Text('Naviguer'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.blue.shade700,
                      foregroundColor: Colors.white,
                    ),
                  ),
                ),
                if (structure.phone != null) ...[
                  const SizedBox(width: 8),
                  OutlinedButton.icon(
                    onPressed: onCall,
                    icon: const Icon(Icons.phone),
                    label: const Text('Appeler'),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  IconData _getTypeIcon() {
    switch (structure.type) {
      case 'hopital': return Icons.local_hospital;
      case 'pharmacie': return Icons.local_pharmacy;
      case 'maternite': return Icons.pregnant_woman;
      case 'clinique': return Icons.medical_services;
      case 'centre_sante': return Icons.health_and_safety;
      default: return Icons.business;
    }
  }
}
```

---

## 4. Flux UX — Application citoyen

Le citoyen reçoit une notification via la table `notifications` (déjà gérée par le trigger `notify_dispatch_created` ou via insertion manuelle).

### 4.1 Notification citoyen

Le dashboard met à jour `incidents.recommended_facility` avec le nom de la structure. Le mobile citoyen peut écouter les updates sur `incidents` :

```dart
// Listener sur incidents pour le citoyen
_supabase
    .channel('citizen-incident-$incidentId')
    .onPostgresChanges(
      event: PostgresChangeEvent.update,
      schema: 'public',
      table: 'incidents',
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'id',
        value: incidentId,
      ),
      callback: (payload) {
        final facility = payload.newRecord['recommended_facility'];
        if (facility != null && facility.toString().isNotEmpty) {
          // Afficher notification au citoyen
          showDialog(
            context: context,
            builder: (_) => AlertDialog(
              title: const Text('🏥 Prise en charge'),
              content: Text(
                'Vous serez pris en charge à :\n\n$facility\n\n'
                'L\'équipe de secours vous y conduira.',
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Compris'),
                ),
              ],
            ),
          );
        }
      },
    )
    .subscribe();
```

---

## 5. Flux complet — Séquence d'événements

```
┌──────────────────────────────────────────────────────────────┐
│ 1. Opérateur Dashboard                                       │
│    └─ Clique "Assigner & Envoyer" sur une structure          │
│       └─ UPDATE dispatches SET assigned_structure_* = ...    │
│       └─ UPDATE incidents SET recommended_facility = ...     │
├──────────────────────────────────────────────────────────────┤
│ 2. Supabase Realtime                                         │
│    └─ Broadcast UPDATE dispatches → canal urgentiste         │
│    └─ Broadcast UPDATE incidents  → canal citoyen            │
├──────────────────────────────────────────────────────────────┤
│ 3. App Urgentiste                                            │
│    └─ Reçoit StructureAssignment                             │
│    └─ Affiche carte avec nom, adresse, coordonnées           │
│    └─ Bouton "Naviguer" → Google Maps / Waze                │
│    └─ Bouton "Appeler" → téléphone de la structure           │
├──────────────────────────────────────────────────────────────┤
│ 4. App Citoyen                                               │
│    └─ Reçoit recommended_facility                            │
│    └─ Affiche "Vous serez pris en charge à [structure]"      │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Récupération initiale (à l'ouverture d'une mission)

Au démarrage de l'écran de mission, l'urgentiste doit vérifier si une structure est déjà assignée :

```dart
Future<StructureAssignment?> fetchExistingAssignment(String dispatchId) async {
  final response = await _supabase
      .from('dispatches')
      .select('assigned_structure_id, assigned_structure_name, '
              'assigned_structure_lat, assigned_structure_lng, '
              'assigned_structure_phone, assigned_structure_address, '
              'assigned_structure_type')
      .eq('id', dispatchId)
      .single();

  if (response['assigned_structure_id'] == null) return null;

  return StructureAssignment(
    structureId: response['assigned_structure_id'],
    name: response['assigned_structure_name'] ?? 'Structure',
    lat: (response['assigned_structure_lat'] as num).toDouble(),
    lng: (response['assigned_structure_lng'] as num).toDouble(),
    phone: response['assigned_structure_phone'],
    address: response['assigned_structure_address'],
    type: response['assigned_structure_type'] ?? 'hopital',
  );
}
```

---

## 7. Edge cases gérés

| Scénario | Comportement |
|---|---|
| Pas de dispatch actif | Toast erreur "Aucun incident trouvé" — pas de crash |
| Structure déjà assignée | Le bouton est désactivé avec "Structure assignée ✓" |
| Changement de structure | L'opérateur peut réassigner une autre structure (re-cliquer) |
| Pas de GPS sur la structure | Impossible — seules les structures avec lat/lng sont affichées |
| Perte de connexion Realtime | Le mobile fait un `fetchExistingAssignment` au reconnect |
| Structure supprimée après assignation | Pas d'impact — les données sont dénormalisées dans dispatches |

---

## 8. Tables impliquées

| Table | Rôle |
|---|---|
| `dispatches` | Stocke les colonnes `assigned_structure_*` |
| `incidents` | Stocke `recommended_facility` (nom de la structure) |
| `health_structures` | Source des structures (lecture seule côté mobile) |
| `notifications` | Notifications push citoyen |

---

## 9. Checklist d'intégration

- [ ] Ajouter le modèle `StructureAssignment` dans le projet Flutter
- [ ] Créer `StructureAssignmentService` avec listener Realtime
- [ ] Intégrer dans `InterventionProvider` / `MissionProvider`
- [ ] Ajouter `StructureAssignmentCard` dans l'écran de mission
- [ ] Implémenter `fetchExistingAssignment` au montage
- [ ] Ajouter la notification locale (Android + iOS)
- [ ] Côté citoyen : écouter `incidents.recommended_facility`
- [ ] Tester le flux complet : Dashboard → Urgentiste → Citoyen
