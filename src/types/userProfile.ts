/** Profil urgentiste / hôpital depuis `users_directory` (+ structure liée si rôle hôpital). */
export interface UserProfile {
  id: string;
  auth_user_id: string;
  role: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  status: string | null;
  available: boolean;
  grade: string | null;
  matricule: string | null;
  specialization: string | null;
  zone: string | null;
  address: string | null;
  assigned_unit_id: string | null;
  health_structure_id: string | null;
  must_change_password: boolean;
  agent_login_id: string | null;
  linkedStructure?: {
    id: string;
    name: string;
    short_name: string | null;
    address: string | null;
    phone: string | null;
  } | null;
}
