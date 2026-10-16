export type Role = "technical_officer" | "supervisor" | "admin";
export type RecordStatus = "draft" | "submitted" | "returned" | "approved";

export const FIELD_TYPES = [
  "checklist", "text", "longtext", "number", "date", "time", "dropdown", "multiselect", "toggle", "ip", "photo", "signature",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface Validation { minLength?: number; maxLength?: number; min?: number; max?: number; regex?: string; message?: string }
export interface Field {
  key: string; label: string; type: FieldType; required: boolean; options: string[]; validation: Validation;
  helpText: string; placeholder: string; allowNote: boolean; allowPhoto: boolean; order: number; groupId: string | null;
  hidden: boolean; defaultValue: unknown; visibleIf: { fieldKey: string; equals: string } | null; role?: string;
}
export interface Group { id: string; name: string }
export interface Section {
  id: string; name: string; description: string; icon: string; order: number; hidden: boolean; groups: Group[]; fields: Field[];
}
export interface Template { sections: Section[]; versionNo?: number; publishedByName?: string; publishedAt?: { toDate(): Date }; changeSummary?: string }

export interface Answer { value?: unknown; status?: "done" | "not_done" | "na"; note?: string; photoUrls?: string[] }
export interface InstallRecord {
  id: string; recordNo?: string; templateVersion: number; status: RecordStatus; technicianId: string; technicianName: string;
  company?: string; branch?: string; terminalId?: string; anydeskNo?: string; installDate?: string;
  answers: Record<string, Answer>; completionPct?: number; location?: { lat: number; lng: number };
  signatureUrl?: string; remark?: string; startedAt?: { toDate(): Date }; submittedAt?: { toDate(): Date };
  reviewedBy?: string; reviewComment?: string; fieldComments?: Record<string, string>; deleted?: boolean;
  createdAt?: { toDate(): Date }; updatedAt?: { toDate(): Date };
}
export interface UserDoc {
  id: string; fullName: string; username: string; employeeId: string; phone: string; email: string; role: Role;
  status: "active" | "inactive"; lastLoginAt?: { toDate(): Date } | null; mustChangePassword?: boolean;
}
