import { Timestamp } from "firebase/firestore";
import { Field, InstallRecord, Section, Template } from "./types";

export const fmtDate = (t?: { toDate(): Date } | null) => (t ? t.toDate().toLocaleString() : "—");
export const statusLabel: Record<string, string> = { draft: "Draft", submitted: "Pending review", returned: "Returned", approved: "Approved" };
export const toTs = (d: Date) => Timestamp.fromDate(d);

export function sortedSections(t: Template | null): Section[] {
  return [...(t?.sections ?? [])].sort((a, b) => a.order - b.order).map((s) => ({ ...s, fields: [...s.fields].sort((a, b) => a.order - b.order) }));
}

export function answerText(f: Field, a: InstallRecord["answers"][string] | undefined): string {
  if (!a) return "—";
  const parts: string[] = [];
  if (a.status) parts.push({ done: "Done", not_done: "Not done", na: "N/A" }[a.status]);
  if (a.value !== undefined && a.value !== null && a.value !== "") parts.push(Array.isArray(a.value) ? a.value.join(", ") : String(a.value));
  return parts.join(" · ") || "—";
}

export function download(name: string, content: string, mime = "text/csv") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
export const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export const keyify = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "field";
