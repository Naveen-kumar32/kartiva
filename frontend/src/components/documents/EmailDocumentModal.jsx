import { Download, Mail, Paperclip, Send } from "lucide-react";
import { useState } from "react";

import { sendEmail } from "@/api";
import { EN } from "@/locales";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast, successToast } from "@/utils/toast";

import { Button, FormInput, FormSelect, FormTextarea, Modal } from "../ui";

const D = EN.DOCS;

/**
 * Email a generated PDF. `documents`: [{ value, label, make: () => Promise<{ blob, filename }> }].
 * Remount with a `key` to reset the form.
 */
export function EmailDocumentModal({ defaultMessage = "", defaultSubject = "", defaultTo = "", documents, onClose, open, sentBy, title = D.EMAIL_TITLE }) {
  const [form, setForm] = useState({ docType: documents[0]?.value ?? "", message: defaultMessage, subject: defaultSubject, to: defaultTo });
  const [busy, setBusy] = useState(null);
  const current = documents.find((d) => d.value === form.docType) ?? documents[0];
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const withPdf = async (kind, fn) => {
    setBusy(kind);
    try { await fn(await current.make()); } catch (err) { errorToast(getErrorMessage(err)); } finally { setBusy(null); }
  };
  const download = (file) => {
    const url = URL.createObjectURL(file.blob);
    const a = Object.assign(document.createElement("a"), { download: file.filename, href: url });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Modal onClose={onClose} open={open} title={title}>
      <div className="space-y-4">
        {documents.length > 1 && <FormSelect label={D.DOCUMENT} name="docType" onChange={set("docType")} options={documents.map(({ label, value }) => ({ label, value }))} value={form.docType} />}
        <FormInput autoComplete="email" hint={D.TO_HINT} label={D.TO} name="to" onChange={set("to")} value={form.to} />
        <FormInput label={D.SUBJECT} name="subject" onChange={set("subject")} value={form.subject} />
        <FormTextarea label={D.MESSAGE} name="message" onChange={set("message")} rows={5} value={form.message} />
        <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><Paperclip aria-hidden className="size-4 text-muted" />{D.ATTACHED(current?.label ?? "")}</p>
        <p className="text-xs text-muted">{D.DEMO_NOTE}</p>
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button loading={busy === "download"} onClick={() => withPdf("download", download)} variant="ghost"><Download className="size-4" />{D.DOWNLOAD_PDF}</Button>
        <Button
          loading={busy === "mailto"}
          onClick={() => withPdf("mailto", (file) => {
            download(file);
            window.location.href = `mailto:${encodeURIComponent(form.to)}?subject=${encodeURIComponent(form.subject)}&body=${encodeURIComponent(`${form.message}\n\n(${D.ATTACH_MANUALLY(file.filename)})`)}`;
          })}
          variant="outline"
        >
          <Mail className="size-4" />{D.OPEN_MAIL_APP}
        </Button>
        <Button
          loading={busy === "send"}
          onClick={() => withPdf("send", async (file) => {
            await sendEmail({ attachment: file, message: form.message, sentBy, subject: form.subject, to: form.to });
            successToast(D.SENT(form.to));
            onClose();
          })}
        >
          <Send className="size-4" />{D.SEND}
        </Button>
      </div>
    </Modal>
  );
}
