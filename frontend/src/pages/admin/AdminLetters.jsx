import { Download, FileSignature, Mail, Paperclip } from "lucide-react";
import { useMemo, useState } from "react";

import { getAdminBuyers, getAttachmentSource, getOutbox, getSmsOutbox } from "@/api";
import {
  Badge, Button, DataTable, Drawer, EmailDocumentModal, FormInput, FormSelect, FormTextarea, KeyValue, Logo, PageHeader, PageLoader, Panel, Tabs,
} from "@/components";
import { PLATFORM, STORES } from "@/data";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { downloadBlankLetterhead, downloadLetter } from "@/utils/documents";
import { formatDate, formatDateTime } from "@/utils/format";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";

const D = EN.DOCS;
const today = () => new Date().toISOString().slice(0, 10);
const load = () => Promise.all([getOutbox(), getAdminBuyers(), getSmsOutbox()]).then(([outbox, buyers, sms]) => ({ buyers, outbox, sms }));
const attachmentsOf = (m) => m.attachments ?? (m.attachment ? [m.attachment] : []);
// Emailed PDFs are stored as a recipe and generated on demand (the backend attaches the real file).
async function downloadAttachment(a) {
  if (!a.kind) return errorToast(D.ATTACHMENT_NOT_STORED);
  try {
    const [src, docs] = await Promise.all([getAttachmentSource(a), import("@/utils/documents")]);
    if (a.kind === "invoice") return docs.downloadTaxInvoice({ order: src.order, platform: src.platform, store: src.store, sub: src.sub });
    if (a.kind === "receipt") return docs.downloadPaymentReceipt({ order: src.order, platform: src.platform, refunds: src.refunds });
    return docs.downloadOrderSummary({ order: src.order, platform: src.platform });
  } catch (err) { return errorToast(getErrorMessage(err)); }
}
const AttachmentLinks = ({ mail }) => {
  const list = attachmentsOf(mail);
  if (!list.length) return "—";
  return (
    <span className="flex flex-col items-start gap-1">
      {list.map((a) => (
        <button className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline" key={a.filename} onClick={(e) => { e.stopPropagation(); downloadAttachment(a); }} type="button">
          <Paperclip aria-hidden className="size-3.5" />{a.filename}
        </button>
      ))}
    </span>
  );
};

export function AdminLetters() {
  useDocumentTitle(EN.ADMIN.NAV_LETTERS);
  const { data, loading, reload } = useAsync(load, []);
  const [tab, setTab] = useState("compose");
  const [openMail, setOpenMail] = useState(null);
  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <PageHeader subtitle={D.LETTERS_SUBTITLE} title={EN.ADMIN.NAV_LETTERS} />
      <Tabs onChange={setTab} tabs={[
        { label: D.TAB_COMPOSE, value: "compose" },
        { count: data.outbox.length, label: D.TAB_OUTBOX, value: "outbox" },
        { count: data.sms.length, label: D.TAB_SMS, value: "sms" },
        { label: D.TAB_LETTERHEAD, value: "letterhead" },
      ]} value={tab} />

      {tab === "compose" && <Composer buyers={data.buyers} onSent={reload} />}

      {tab === "outbox" && (
        <Panel>
          <DataTable
            columns={[
              { header: D.SENT_AT, key: "sentAt", render: (m) => <span className="whitespace-nowrap">{formatDateTime(m.sentAt)}</span> },
              { header: D.TO, key: "to", render: (m) => m.to.join(", ") },
              { header: D.SUBJECT, key: "subject", render: (m) => <span className="font-medium">{m.subject}</span> },
              { header: D.ATTACHMENT, key: "attachment", render: (m) => <AttachmentLinks mail={m} /> },
              { header: D.SENT_BY, key: "sentBy" },
            ]}
            empty={D.OUTBOX_EMPTY}
            onRowClick={setOpenMail}
            rows={data.outbox}
          />
          <p className="mt-3 text-xs text-muted">{D.DEMO_NOTE}</p>
        </Panel>
      )}

      {tab === "sms" && (
        <Panel>
          <DataTable
            columns={[
              { header: D.SENT_AT, key: "sentAt", render: (m) => <span className="whitespace-nowrap">{formatDateTime(m.sentAt)}</span> },
              { header: D.CHANNEL, key: "channel", render: (m) => <Badge tone={m.channel === "whatsapp" ? "success" : "info"}>{D.CHANNELS[m.channel] ?? m.channel}</Badge> },
              { header: D.TO, key: "to", render: (m) => <span className="font-mono text-xs">{m.to}</span> },
              { header: D.MESSAGE, key: "text", render: (m) => <span className="block max-w-xl text-sm">{m.text}</span> },
            ]}
            empty={D.SMS_EMPTY}
            rows={data.sms}
          />
          <p className="mt-3 text-xs text-muted">{D.SMS_NOTE}</p>
        </Panel>
      )}

      {tab === "letterhead" && (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <LetterPreview letter={{ body: D.LETTERHEAD_SAMPLE_BODY, subject: "", toAddress: "", toName: "" }} blank />
          <Panel title={D.TAB_LETTERHEAD}>
            <p className="text-sm text-muted">{D.LETTERHEAD_HINT}</p>
            <div className="mt-4"><KeyValue items={[[EN.ADMIN.FIELD_LEGAL_NAME, PLATFORM.legalName], [EN.ADMIN.FIELD_ADDRESS, PLATFORM.address], ["GSTIN", PLATFORM.gstin], ["CIN", PLATFORM.cin], [EN.ADMIN.FIELD_SUPPORT_EMAIL, PLATFORM.supportEmail], [EN.ADMIN.FIELD_SUPPORT_PHONE, PLATFORM.supportPhone], [D.WEBSITE, PLATFORM.website]]} /></div>
            <Button className="mt-5" onClick={() => downloadBlankLetterhead({ platform: PLATFORM })}><Download className="size-4" />{D.DOWNLOAD_LETTERHEAD}</Button>
          </Panel>
        </div>
      )}

      <Drawer onClose={() => setOpenMail(null)} open={Boolean(openMail)} side="right" size="md" title={openMail?.subject ?? ""}>
        {openMail && (
          <div className="space-y-4 p-5">
            <KeyValue items={[[D.TO, openMail.to.join(", ")], [D.SENT_AT, formatDateTime(openMail.sentAt)], [D.SENT_BY, openMail.sentBy], [D.ATTACHMENT, <AttachmentLinks key="a" mail={openMail} />]]} />
            <div className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm">{openMail.message || "—"}</div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function recipientFrom(kind, id, buyers) {
  if (kind === "seller") {
    const s = STORES.find((x) => x.slug === id);
    return s && { address: `${s.city}, ${s.state}\nGSTIN ${s.gstin}`, email: s.supportEmail ?? `accounts@${s.slug}.example.in`, name: s.name };
  }
  if (kind === "buyer") {
    const b = buyers.find((x) => x.email === id);
    return b && { address: `${b.address.line1}\n${b.address.city}, ${b.address.state} - ${b.address.pincode}`, email: b.email, name: b.name };
  }
  return null;
}

function Composer({ buyers, onSent }) {
  const [kind, setKind] = useState("seller");
  const [letter, setLetter] = useState(() => {
    const store = STORES[1];
    return {
      body: D.TEMPLATES.welcome.body(store.name, PLATFORM), closing: "Yours sincerely,", date: today(), recipientId: store.slug,
      reference: `KTV/LTR/26-27/${String(Math.floor(Date.now() / 1e5) % 1000).padStart(3, "0")}`, salutation: "Dear Sir/Madam,", signatoryName: "Kavya Iyer",
      signatoryTitle: "Head of Marketplace Operations", subject: D.TEMPLATES.welcome.subject, template: "welcome",
      toAddress: `${store.city}, ${store.state}\nGSTIN ${store.gstin}`, toEmail: `accounts@${store.slug}.example.in`, toName: store.name,
    };
  });
  const [emailing, setEmailing] = useState(false);
  const set = (key) => (e) => setLetter((l) => ({ ...l, [key]: e.target.value }));

  const pickRecipient = (k, id) => {
    const r = recipientFrom(k, id, buyers);
    setLetter((l) => ({ ...l, recipientId: id, ...(r ? { toAddress: r.address, toEmail: r.email, toName: r.name } : {}) }));
  };
  const applyTemplate = (key) => {
    const t = D.TEMPLATES[key];
    setLetter((l) => ({ ...l, body: t.body(l.toName || "Partner", PLATFORM), subject: t.subject, template: key }));
  };
  const options = useMemo(() => (kind === "seller" ? STORES.map((s) => ({ label: s.name, value: s.slug })) : buyers.map((b) => ({ label: `${b.name} · ${b.email}`, value: b.email }))), [kind, buyers]);
  const make = () => Promise.resolve(downloadLetter({ letter, platform: PLATFORM }, { output: "blob" }));

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
      <Panel title={D.TAB_COMPOSE}>
        <div className="space-y-4">
          <FormSelect label={D.TEMPLATE} name="template" onChange={(e) => applyTemplate(e.target.value)} options={Object.entries(D.TEMPLATES).map(([value, t]) => ({ label: t.label, value }))} value={letter.template} />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormSelect label={D.RECIPIENT_TYPE} name="kind" onChange={(e) => { setKind(e.target.value); if (e.target.value === "custom") setLetter((l) => ({ ...l, recipientId: "", toAddress: "", toEmail: "", toName: "" })); }} options={[{ label: D.KIND_SELLER, value: "seller" }, { label: D.KIND_BUYER, value: "buyer" }, { label: D.KIND_CUSTOM, value: "custom" }]} value={kind} />
            {kind !== "custom" && <FormSelect label={D.RECIPIENT} name="recipientId" onChange={(e) => pickRecipient(kind, e.target.value)} options={options} placeholder="—" value={letter.recipientId} />}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormInput label={D.TO_NAME} name="toName" onChange={set("toName")} value={letter.toName} />
            <FormInput label={D.TO_EMAIL} name="toEmail" onChange={set("toEmail")} type="email" value={letter.toEmail} />
          </div>
          <FormTextarea label={D.TO_ADDRESS} name="toAddress" onChange={set("toAddress")} rows={2} value={letter.toAddress} />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormInput label={D.REFERENCE} name="reference" onChange={set("reference")} value={letter.reference} />
            <FormInput label={EN.TABLE.DATE} name="date" onChange={set("date")} type="date" value={letter.date} />
          </div>
          <FormInput label={D.SUBJECT} name="subject" onChange={set("subject")} value={letter.subject} />
          <FormInput label={D.SALUTATION} name="salutation" onChange={set("salutation")} value={letter.salutation} />
          <FormTextarea hint={D.BODY_HINT} label={D.BODY} name="body" onChange={set("body")} rows={9} value={letter.body} />
          <div className="grid gap-3 sm:grid-cols-2">
            <FormInput label={D.SIGNATORY} name="signatoryName" onChange={set("signatoryName")} value={letter.signatoryName} />
            <FormInput label={D.SIGNATORY_TITLE} name="signatoryTitle" onChange={set("signatoryTitle")} value={letter.signatoryTitle} />
          </div>
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button onClick={() => { try { downloadLetter({ letter, platform: PLATFORM }); successToast(D.LETTER_DOWNLOADED); } catch (err) { errorToast(getErrorMessage(err)); } }}><FileSignature className="size-4" />{D.DOWNLOAD_PDF}</Button>
            <Button onClick={() => setEmailing(true)} variant="subtle"><Mail className="size-4" />{D.EMAIL_LETTER}</Button>
          </div>
        </div>
      </Panel>
      <LetterPreview letter={letter} />
      {emailing && (
        <EmailDocumentModal
          defaultMessage={D.LETTER_EMAIL_BODY(letter.toName, letter.subject)}
          defaultSubject={letter.subject}
          defaultTo={letter.toEmail}
          documents={[{ label: D.LETTER_LABEL(letter.reference), make, value: "letter" }]}
          onClose={() => { setEmailing(false); onSent(); }}
          open
          sentBy="Kavya Iyer"
        />
      )}
    </div>
  );
}

// HTML replica of the PDF letterhead for instant preview.
function LetterPreview({ blank, letter }) {
  return (
    <div className="sticky top-20 h-fit">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{D.PREVIEW}</p>
      <article className="aspect-[1/1.414] overflow-hidden rounded-lg bg-white p-[6%] text-[11px] leading-relaxed text-ink shadow-raised ring-1 ring-line sm:text-xs">
        <header className="flex items-start justify-between gap-4">
          <div className="pointer-events-none"><Logo /><p className="mt-1 text-[10px] text-muted">{EN.APP.TAGLINE}</p></div>
          <div className="max-w-[55%] text-right text-[10px] text-muted">
            <p className="font-bold text-ink">{PLATFORM.legalName}</p>
            <p>{PLATFORM.address}</p>
            <p>GSTIN {PLATFORM.gstin} · CIN {PLATFORM.cin}</p>
            <p>{PLATFORM.supportPhone} · {PLATFORM.supportEmail} · {PLATFORM.website}</p>
          </div>
        </header>
        <div className="mt-3 h-1 rounded bg-brand-600"><div className="h-1 w-1/5 translate-y-1 rounded bg-accent-500" /></div>
        {blank ? <p className="mt-10 text-center text-muted">{letter.body}</p> : (
          <div className="mt-6 space-y-3">
            <div className="flex justify-between text-muted"><span>{letter.reference && `Ref: ${letter.reference}`}</span><span>Date: {formatDate(letter.date)}</span></div>
            <div><p className="font-semibold">To,</p><p className="font-semibold">{letter.toName}</p><p className="whitespace-pre-line text-muted">{letter.toAddress}</p></div>
            {letter.subject && <p className="font-semibold">Subject: {letter.subject}</p>}
            <p>{letter.salutation}</p>
            {letter.body.split(/\n\s*\n/).map((para, i) => <p key={i}>{para}</p>)}
            <div className="pt-2"><p>{letter.closing}</p><p className="font-semibold">For {PLATFORM.legalName}</p><p className="mt-6 font-semibold">{letter.signatoryName}</p><p className="text-muted">{letter.signatoryTitle}</p></div>
          </div>
        )}
      </article>
    </div>
  );
}
