# Spécification Technique : Bilans Médicaux Dynamiques

Ce document décrit l'architecture du système de bilans médicaux dynamiques (Questionnaires) utilisé par l'application mobile. Il sert de guide pour l'implémentation des routes API et du stockage en base de données par l'équipe backend.

## 1. Vision d'ensemble

L'application mobile remplace les formulaires codés en dur par un moteur de rendu de schémas JSON. 
Chaque type d'incident (ex: `trauma`, `pediatrie`) peut avoir son propre questionnaire.

### Flux de données
1. **Frontend** : Demande le schéma du questionnaire pour un `incident_type` donné.
2. **Frontend** : Affiche le formulaire dynamiquement.
3. **Frontend** : Envoie les réponses structurées (JSON) au backend lors de la validation du bilan.
4. **Backend** : Stocke les réponses dans une colonne JSONB dédiée `medical_assessment`.

## 2. Structure du Schéma (Storage: `assessment_schemas`)

Le backend doit être capable de servir des objets JSON suivant cette structure :

```typescript
interface AssessmentSchema {
  incident_type: string;    // Ex: "trauma", "pediatrie", "default"
  version: string;          // Pour gestion de cache (ex: "1.0.4")
  steps: AssessmentStep[];
}

interface AssessmentStep {
  id: string;               // Clé unique pour la donnée (ex: "gcs_score")
  type: "binary" | "choice" | "range" | "info";
  label: string;            // Titre affiché
  description?: string;     // Sous-titre optionnel
  options?: Array<{
    label: string;
    value: any;
    color?: string;         // Hex code (ex: "#FF0000")
    icon?: string;          // MaterialIcon name
    critical?: boolean;     // True si la valeur implique une urgence vitale
  }>;
  advice?: {                // Logique conditionnelle d'affichage de conseil
    if: { fieldId: string; value: any };
    text: string;           // Message du conseil (ex: "Commencer RCR")
  };
}
```

## 3. Stockage des Réponses (Table: `dispatches`)

Les réponses sont envoyées sous forme d'objet plat `Record<string, any>` et doivent être stockées dans la colonne JSONB `medical_assessment`.

**Exemple de payload envoyé par le mobile :**
```json
{
  "conscious": true,
  "breathing": true,
  "gcs_score": 15,
  "hemorrhage": "none",
  "assessment_completed_at": "2024-04-15T12:00:00Z"
}
```

## 4. Stratégie de Transition (Legacy)

Pour assurer la compatibilité avec les systèmes existants (ex: impression de rapports, anciens tableaux de bord), le mobile continuera temporairement de mettre à jour le champ `incidents.description` en y concaténant une version texte lisible du bilan.

**Exemple de chaîne concaténée :**
`" [ÉVALUATION] Conscience: Oui, Respiration: Oui, Gravité: Stable"`

## 5. Routes API prévues (Futur)

Le mobile prévoira des appels vers :
- `GET /api/v1/questionnaires/schemas?type={incident_type}` : Récupérer un schéma spécifique.
- `GET /api/v1/questionnaires/schemas/versions` : Vérifier les versions pour rafraîchir le cache local.

---
*Note : Pour la phase MVP, les schémas sont embarqués dans le code mobile mais respectent strictement cette spécification.*
