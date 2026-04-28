# 🏥 Analysis: Hospital Data Discrepancy

## 1. The "Good" Data (First 5 Results)
The initial list of hospitals displayed in the app is sourced from the `suggested_hospitals` field within the active mission record.

*   **Source**: Backend Edge Function (`compute-mission-hospitals`).
*   **Intelligence**: This function performs real-time geographic calculations using Mapbox/Routing engines to provide accurate **ETA** and **Distance**.
*   **Filtering**: It ranks hospitals based on a complex score (Distance + Specialties + Real-time Bed Availability).
*   **Data Quality**: These are curated, high-priority facilities integrated into the EB-Urgence network.

## 2. The "Raw" Data (Load More & Search Results)
When "Plus d'établissements" is clicked or a search is performed, the app currently falls back to a direct query of the `health_structures` table.

*   **Source**: Direct Database Query (`public.health_structures`).
*   **Why ETA/Distance is 0**: Database queries are static. They do not automatically calculate travel time from your live GPS coordinates. Without a specialized PostGIS query or calling the backend ranking logic, these values default to `0`.
*   **Data Origin**: The `health_structures` table contains a broad directory of facilities. Many of these may have been imported from regional health registries (explaining the "scrapped" look) and may not yet have real-time synchronization or the full "EB-Urgence" validation that the top-ranked suggestions have.

## 3. Recommended Backend Fixes
To align the search results with the high-quality suggestions, we recommend the following updates to the backend:

1.  **Pagination Support**: Update the `compute-mission-hospitals` edge function to accept `limit` and `offset` parameters.
2.  **Search Integration**: Add a `query` parameter to the same edge function. This will allow the backend to return its "smart" ranked data even when a user is searching for a specific name.
3.  **Real-time Computation**: Search results should be piped through the ranking engine so they include valid Distance and ETA values.

---
**Status**: The frontend now supports the Search UI and Load More UI, but is currently using the "Raw Path" for additional results until the backend API is extended.
