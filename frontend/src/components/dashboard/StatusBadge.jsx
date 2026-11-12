import { STATUS_TONE } from "@/constants";
import { EN } from "@/locales";

import { Badge } from "../ui";

export function StatusBadge({ status }) {
  const label = EN.ORDER.STATUS[status] ?? status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{label}</Badge>;
}
