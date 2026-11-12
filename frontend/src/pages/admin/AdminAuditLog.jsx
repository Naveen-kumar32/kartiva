import { useMemo, useState } from "react";

import { getAuditLog } from "@/api";
import { Badge, DataTable, ExportMenu, PageHeader, PageLoader, Panel, SearchInput, Select } from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { downloadTable } from "@/utils/documents";
import { formatDateTime } from "@/utils/format";

const T = EN.ADMIN_TOOLS;
const toneOf = (action) => (/(reject|suspend|delete|hidden|blocked|cancel|disabled)/.test(action) ? "danger" : /(approve|paid|created|activated|enabled|restored)/.test(action) ? "success" : "neutral");

export function AdminAuditLog() {
  useDocumentTitle(EN.ADMIN.NAV_AUDIT);
  const { data, loading } = useAsync(getAuditLog, []);
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const areas = useMemo(() => [...new Set((data ?? []).map((e) => e.action.split(".")[0]))].sort(), [data]);
  const rows = useMemo(() => (data ?? []).filter((e) => (!area || e.action.startsWith(`${area}.`)) && `${e.action} ${e.target} ${e.details} ${e.actor}`.toLowerCase().includes(q.toLowerCase())), [data, q, area]);
  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <PageHeader
        actions={<ExportMenu onExport={(format) => downloadTable(format, "kartiva-audit-log.csv", [{ header: "When", key: "at" }, { header: "Actor", key: "actor" }, { header: "Action", key: "action" }, { header: "Target", key: "target" }, { header: "Details", key: "details" }], rows, { title: EN.ADMIN.NAV_AUDIT })} size="md" />}
        subtitle={T.AUDIT_SUBTITLE}
        title={EN.ADMIN.NAV_AUDIT}
      />
      <Panel>
        <div className="mb-4 flex flex-wrap gap-3">
          <SearchInput className="min-w-60 flex-1" onChange={setQ} placeholder={T.SEARCH_AUDIT} value={q} />
          <div className="w-56"><Select ariaLabel={T.AREA} onChange={setArea} options={areas.map((a) => ({ label: a, value: a }))} placeholder={T.ALL_AREAS} size="sm" value={area} /></div>
        </div>
        <DataTable
          columns={[
            { header: T.WHEN, key: "at", render: (e) => <span className="whitespace-nowrap">{formatDateTime(e.at)}</span> },
            { header: T.ACTOR, key: "actor" },
            { header: T.ACTION, key: "action", render: (e) => <Badge tone={toneOf(e.action)}>{e.action}</Badge> },
            { header: T.TARGET, key: "target" },
            { header: EN.TABLE.DESCRIPTION, key: "details", className: "max-w-md" },
          ]}
          empty={T.NO_AUDIT}
          rows={rows}
        />
      </Panel>
    </div>
  );
}
