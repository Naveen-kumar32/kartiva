import { Eye, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { getAdminBuyers, getAdminOrders, updateBuyer } from "@/api";
import {
  Badge, Button, DataTable, Drawer, EmptyState, ErrorState, ExportMenu, KeyValue, MiniStat, PageHeader, PageLoader, Panel, SearchInput, StatusBadge, Tabs, Toggle,
} from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { errorToast, formatCurrency, formatDate, formatDateTime, getErrorMessage, infoToast } from "@/utils";
import { downloadTable } from "@/utils/documents";

import { DrawerSection, SrHeader } from "./opsShared";
import { useActor } from "./opsUtils";

const O = EN.ADMIN_OPS;
const FILTERS = [
  ["all", O.TAB_ALL, () => true],
  ["cod", O.TAB_COD_BLOCKED, (b) => b.codBlocked],
  ["inactive", O.TAB_DEACTIVATED, (b) => !b.isActive],
  ["refusals", O.TAB_REFUSALS, (b) => b.refusals > 0],
];

export function AdminBuyers() {
  useDocumentTitle(O.BUYERS_TITLE);
  const actor = useActor();
  const { data, error, loading, reload, setData } = useAsync(getAdminBuyers, []);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [viewEmail, setViewEmail] = useState(null);

  const rows = useMemo(() => {
    if (!data) return [];
    const test = FILTERS.find(([k]) => k === tab)[2];
    const term = q.trim().toLowerCase();
    return data.filter((b) => test(b) && (!term || b.name.toLowerCase().includes(term) || b.email.toLowerCase().includes(term) || b.address?.city?.toLowerCase().includes(term)));
  }, [data, tab, q]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const patch = async (buyer, change, message) => {
    setData(data.map((b) => (b.email === buyer.email ? { ...b, ...change } : b))); // optimistic
    try {
      await updateBuyer(buyer.email, change, actor);
      infoToast(message);
    } catch (err) {
      setData(data);
      errorToast(getErrorMessage(err));
    }
  };

  const exportList = (format) => downloadTable(format, `kartiva-buyers-${tab}.csv`, [
    { header: O.COL_NAME, key: "name" }, { header: O.COL_EMAIL, key: "email" }, { header: O.COL_CITY, value: (b) => b.address?.city }, { header: O.COL_STATE, value: (b) => b.address?.state },
    { header: O.COL_ORDERS, key: "orders" }, { header: O.COL_SPENT, key: "spent" }, { header: O.COL_LAST_ORDER, key: "lastOrderAt" }, { header: O.COL_REFUSALS, key: "refusals" },
    { header: O.COL_COD_BLOCKED, value: (b) => (b.codBlocked ? "Yes" : "No") }, { header: O.COL_ACTIVE, value: (b) => (b.isActive ? "Yes" : "No") }, { header: O.COL_JOINED, key: "joinedAt" },
  ], rows, { title: O.BUYERS_TITLE });

  const viewed = data.find((b) => b.email === viewEmail);

  return (
    <div className="space-y-6">
      <PageHeader actions={<ExportMenu onExport={exportList} size="md" />} subtitle={O.BUYERS_SUBTITLE} title={O.BUYERS_TITLE} />
      <Panel>
        <Tabs onChange={setTab} tabs={FILTERS.map(([value, label, test]) => ({ count: data.filter(test).length, label, value }))} value={tab} />
        <SearchInput className="my-4 max-w-sm" onChange={setQ} placeholder={O.SEARCH_BUYERS} value={q} />
        {rows.length === 0 ? <EmptyState icon={Users} title={O.NO_RESULTS} /> : (
          <DataTable
            columns={[
              { header: O.COL_NAME, key: "name", render: (b) => (
                <button className="text-left" onClick={() => setViewEmail(b.email)} type="button">
                  <span className="font-medium hover:text-brand-700">{b.name}</span>
                  <span className="block text-xs text-muted">{b.email}</span>
                </button>
              ) },
              { header: O.COL_CITY, key: "city", render: (b) => b.address?.city ?? "—" },
              { align: "right", header: O.COL_ORDERS, key: "orders" },
              { align: "right", header: O.COL_SPENT, key: "spent", render: (b) => formatCurrency(b.spent) },
              { header: O.COL_LAST_ORDER, key: "lastOrderAt", render: (b) => (b.lastOrderAt ? formatDate(b.lastOrderAt) : "—") },
              { align: "right", header: O.COL_REFUSALS, key: "refusals", render: (b) => (b.refusals ? <Badge tone="danger">{b.refusals}</Badge> : 0) },
              { header: O.COL_COD_BLOCKED, key: "codBlocked", render: (b) => <Toggle checked={Boolean(b.codBlocked)} label={O.COD_BLOCK_LABEL(b.name)} onChange={(v) => patch(b, { codBlocked: v }, v ? O.COD_BLOCKED_TOAST(b.name) : O.COD_UNBLOCKED_TOAST(b.name))} /> },
              { header: O.COL_ACTIVE, key: "isActive", render: (b) => <Toggle checked={b.isActive !== false} label={O.ACTIVE_LABEL(b.name)} onChange={(v) => patch(b, { isActive: v }, v ? O.BUYER_ACTIVATED(b.name) : O.BUYER_DEACTIVATED(b.name))} /> },
              { header: <SrHeader>{O.COL_ACTIONS}</SrHeader>, key: "view", render: (b) => <Button aria-label={O.VIEW_ITEM(b.name)} onClick={() => setViewEmail(b.email)} size="sm" variant="ghost"><Eye className="size-4" /></Button> },
            ]}
            rowKey="email"
            rows={rows}
          />
        )}
      </Panel>
      <Drawer onClose={() => setViewEmail(null)} open={Boolean(viewed)} side="right" size="lg" title={viewed?.name ?? ""}>
        {viewed && <BuyerDetail buyer={viewed} />}
      </Drawer>
    </div>
  );
}

function BuyerDetail({ buyer }) {
  const { data: orders, loading } = useAsync(async () => (await getAdminOrders()).filter((o) => o.buyer.email === buyer.email), [buyer.email]);
  const a = buyer.address;
  return (
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap gap-2">
        {buyer.codBlocked && <Badge tone="danger">{O.COL_COD_BLOCKED}</Badge>}
        {buyer.isActive === false && <Badge tone="neutral">{O.TAB_DEACTIVATED}</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniStat label={O.COL_ORDERS} value={buyer.orders} />
        <MiniStat label={O.COL_SPENT} value={formatCurrency(buyer.spent)} />
      </div>
      <KeyValue items={[
        [O.COL_EMAIL, buyer.email], [O.PHONE, a?.phone ? `+91 ${a.phone}` : "—"],
        [O.DEFAULT_ADDRESS, a ? `${a.line1}, ${a.city}, ${a.state} ${a.pincode}` : "—"],
        [O.COL_JOINED, formatDate(buyer.joinedAt)], [O.COL_REFUSALS, buyer.refusals],
      ]} />
      <DrawerSection title={O.ORDER_HISTORY}>
        {loading ? <p className="text-sm text-muted">{EN.COMMON.LOADING}</p> : orders.length === 0 ? <p className="text-sm text-muted">{O.NO_ORDERS}</p> : (
          <ul className="space-y-2">
            {orders.map((o) => (
              <li className="rounded-lg border border-line p-3 text-sm" key={o.number}>
                <div className="flex justify-between gap-2"><span className="font-mono text-xs font-semibold">{o.number}</span><span className="font-semibold tabular">{formatCurrency(o.grandTotal)}</span></div>
                <p className="mt-0.5 text-xs text-muted">{formatDateTime(o.createdAt)} · {o.paymentMethod === "cod" ? "COD" : O.ONLINE}</p>
                <div className="mt-2 flex flex-wrap gap-1">{o.subOrders.map((s) => <span className="flex items-center gap-1 text-xs text-muted" key={s.number}>{s.storeName}<StatusBadge status={s.status} /></span>)}</div>
              </li>
            ))}
          </ul>
        )}
      </DrawerSection>
    </div>
  );
}
