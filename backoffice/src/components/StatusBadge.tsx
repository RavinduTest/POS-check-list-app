import { statusLabel } from "@/lib/util";
export default function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{statusLabel[status] ?? status}</span>;
}
