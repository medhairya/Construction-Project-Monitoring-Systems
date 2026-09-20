// Visibility rules from Section 1.3 of the plan.
import type { Department, Desk, Profile, Project, Role } from "@/lib/domain/types";

export type Action =
  | "project.search"
  | "project.create"
  | "project.approve"
  | "project.return"
  | "file.forward"
  | "movement.read_own_dept"
  | "movement.read_any_dept"
  | "execution.submit"
  | "escalation.decide"
  | "escalation.justify"
  | "admin.manage";

const MATRIX: Record<Action, Role[]> = {
  "project.search": ["MINISTRY", "DEPT_HEAD", "DEPT_OPERATOR", "SITE_ENGINEER", "SUPER_ADMIN"],
  "project.create": ["MINISTRY", "SUPER_ADMIN"],
  "project.approve": ["MINISTRY", "DEPT_HEAD"],
  "project.return": ["MINISTRY", "DEPT_HEAD"],
  "file.forward": ["DEPT_HEAD", "DEPT_OPERATOR"],
  "movement.read_own_dept": ["MINISTRY", "DEPT_HEAD", "DEPT_OPERATOR", "SUPER_ADMIN"],
  "movement.read_any_dept": ["MINISTRY", "SUPER_ADMIN"],
  "execution.submit": ["SITE_ENGINEER"],
  "escalation.decide": ["MINISTRY"],
  "escalation.justify": ["DEPT_HEAD", "DEPT_OPERATOR", "SITE_ENGINEER"],
  "admin.manage": ["SUPER_ADMIN"],
};

export function can(user: Pick<Profile, "role">, action: Action): boolean {
  return MATRIX[action].includes(user.role);
}

/**
 * Desk-level movement visibility (Section 1.3). Ministry and Super Admin see
 * every department; everyone else only their own. Site engineers see none.
 */
export function canSeeDeskDetail(
  user: Pick<Profile, "role" | "department_id">,
  departmentId: string,
): boolean {
  if (user.role === "MINISTRY" || user.role === "SUPER_ADMIN") return true;
  if (user.role === "SITE_ENGINEER") return false;
  return user.department_id === departmentId;
}

/** Departments of a movement's two endpoints. */
export function movementDepartments(
  fromDeskId: string | null,
  toDeskId: string | null,
  desks: Desk[],
): string[] {
  const ids = [fromDeskId, toDeskId].filter(Boolean) as string[];
  return ids
    .map((id) => desks.find((d) => d.id === id)?.department_id)
    .filter(Boolean) as string[];
}

/** A site engineer only sees projects assigned to them. */
export function canSeeProject(
  user: Pick<Profile, "role" | "id">,
  project: Pick<Project, "assigned_site_engineer_id">,
): boolean {
  if (user.role !== "SITE_ENGINEER") return true;
  return project.assigned_site_engineer_id === user.id;
}

export function departmentOfDesk(deskId: string | null, desks: Desk[]): string | null {
  if (!deskId) return null;
  return desks.find((d) => d.id === deskId)?.department_id ?? null;
}

export function departmentName(id: string | null, departments: Department[]): string {
  if (!id) return "—";
  return departments.find((d) => d.id === id)?.name ?? "—";
}

export const ROLE_LABEL: Record<Role, string> = {
  MINISTRY: "Ministry (CMO)",
  DEPT_HEAD: "Department Head",
  DEPT_OPERATOR: "Department Operator",
  SITE_ENGINEER: "Site Engineer",
  SUPER_ADMIN: "Super Admin",
};
