import { useFormik } from "formik";
import { Bell, Mail, Radio, Send, Users } from "lucide-react";
import { useMemo } from "react";

import { getBroadcastData, sendBroadcast } from "@/api";
import { Button, DataTable, ErrorState, FormInput, FormSelect, FormTextarea, PageHeader, PageLoader, Panel } from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";
import { cn, errorToast, formatDateTime, formatNumber, getErrorMessage, successToast } from "@/utils";
import { createBroadcastSchema } from "@/validators";

import { Pill } from "./opsShared";
import { useActor } from "./opsUtils";

const P = EN.ADMIN_PRO.BROADCASTS;
const AUDIENCES = ["sellers", "buyers", "everyone", "store", "plan"];
const CHANNELS = [["in_app", Bell], ["email", Mail]];

export function AdminBroadcasts() {
  useDocumentTitle(P.TITLE);
  const actor = useActor();
  const { data, error, loading, reload, setData } = useAsync(getBroadcastData, []);
  const formik = useFormik({
    initialValues: { audience: "sellers", body: "", channels: ["in_app"], link: "", planCode: "gold", storeSlug: "", title: "" },
    onSubmit: async (values, { resetForm }) => {
      try {
        const sent = await sendBroadcast(values, actor);
        successToast(P.SENT(sent.recipients, sent.audienceLabel));
        resetForm();
        setData(await getBroadcastData());
      } catch (err) {
        errorToast(getErrorMessage(err));
      }
    },
    validationSchema: createBroadcastSchema(EN.VALIDATION, P.VALIDATION),
  });
  const v = formik.values;
  const estimate = useMemo(() => {
    if (!data) return 0;
    const c = data.counts;
    return { buyers: c.buyers, everyone: c.buyers + c.sellers, plan: c.plans[v.planCode] ?? 0, sellers: c.sellers, store: v.storeSlug ? 1 : 0 }[v.audience];
  }, [data, v.audience, v.planCode, v.storeSlug]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const field = (name) => ({ error: formik.errors[name], name, onBlur: formik.handleBlur, onChange: formik.handleChange, touched: formik.touched[name], value: formik.values[name] });
  const toggleChannel = (ch) => formik.setFieldValue("channels", v.channels.includes(ch) ? v.channels.filter((x) => x !== ch) : [...v.channels, ch]);
  const audienceLabel = (b) => (b.audienceLabel ?? P.AUDIENCE[b.audience] ?? b.audience);

  return (
    <div className="space-y-6">
      <PageHeader subtitle={P.SUBTITLE} title={P.TITLE} />
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel title={P.COMPOSE}>
          <form className="space-y-4" noValidate onSubmit={formik.handleSubmit}>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">{P.F_AUDIENCE}</legend>
              <div className="flex flex-wrap gap-2">
                {AUDIENCES.map((a) => (
                  <label className={cn("cursor-pointer rounded-lg border px-3 py-2 text-sm transition", v.audience === a ? "border-brand-500 bg-brand-50 font-semibold text-brand-800" : "border-line hover:border-brand-300")} key={a}>
                    <input checked={v.audience === a} className="sr-only" name="audience" onChange={() => formik.setFieldValue("audience", a)} type="radio" value={a} />{P.AUDIENCE[a]}
                  </label>
                ))}
              </div>
            </fieldset>
            {v.audience === "store" && <FormSelect label={P.F_STORE} options={data.stores.map((s) => ({ label: s.name, value: s.slug }))} placeholder={EN.COMMON.SELECT} {...field("storeSlug")} />}
            {v.audience === "plan" && <FormSelect label={P.F_PLAN} options={data.plans.map((p) => ({ label: `${p.name} (${data.counts.plans[p.code] ?? 0})`, value: p.code }))} {...field("planCode")} />}
            <FormInput label={P.F_TITLE} maxLength={80} {...field("title")} />
            <FormTextarea label={P.F_BODY} maxLength={500} rows={4} {...field("body")} />
            <FormInput hint={P.F_LINK_HINT} label={P.F_LINK} placeholder="/advertise" {...field("link")} />
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">{P.F_CHANNELS}</legend>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map(([ch, Icon]) => (
                  <label className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", v.channels.includes(ch) ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line")} key={ch}>
                    <input checked={v.channels.includes(ch)} className="size-4 accent-brand-600" onChange={() => toggleChannel(ch)} type="checkbox" /><Icon aria-hidden className="size-4" />{P.CHANNEL[ch]}
                  </label>
                ))}
              </div>
              {formik.touched.channels !== undefined && formik.errors.channels && <p className="mt-1 text-xs text-red-600" role="alert">{formik.errors.channels}</p>}
            </fieldset>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
              <p className="flex items-center gap-2 text-sm"><Users aria-hidden className="size-4 text-muted" />{P.ESTIMATE(formatNumber(estimate))}</p>
              <Button disabled={!estimate} loading={formik.isSubmitting} onClick={() => formik.setFieldTouched("channels", true)} type="submit"><Send className="size-4" />{P.SEND}</Button>
            </div>
          </form>
        </Panel>
        <Panel title={P.PREVIEW}>
          <div className="space-y-4">
            <div className="rounded-xl border border-line p-3 shadow-card">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted"><Bell aria-hidden className="size-3.5" />{P.CHANNEL.in_app}</p>
              <p className="font-semibold">{v.title || P.TITLE_PLACEHOLDER}</p>
              <p className="text-sm text-muted">{v.body || P.BODY_PLACEHOLDER}</p>
            </div>
            {v.channels.includes("email") && (
              <div className="rounded-xl border border-line p-3">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted"><Mail aria-hidden className="size-3.5" />{P.CHANNEL.email}</p>
                <p className="text-xs text-muted">{P.EMAIL_NOTE}</p>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <Panel title={P.HISTORY}>
        <DataTable
          columns={[
            { header: P.COL_SENT, key: "sentAt", render: (b) => <span className="whitespace-nowrap text-xs">{formatDateTime(b.sentAt)}</span> },
            { header: P.F_TITLE, key: "title", render: (b) => <span className="block max-w-80"><span className="font-medium">{b.title}</span><span className="line-clamp-1 text-xs text-muted">{b.body}</span></span> },
            { header: P.F_AUDIENCE, key: "audience", render: (b) => audienceLabel(b) },
            { header: P.F_CHANNELS, key: "channels", render: (b) => <span className="flex flex-wrap gap-1">{b.channels.map((c) => <Pill key={c} tone={c === "email" ? "info" : "brand"}>{P.CHANNEL[c] ?? c}</Pill>)}</span> },
            { align: "right", header: P.COL_RECIPIENTS, key: "recipients", render: (b) => formatNumber(b.recipients) },
            { header: P.COL_BY, key: "sentBy" },
          ]}
          empty={<span className="inline-flex items-center gap-2"><Radio className="size-4" />{P.EMPTY}</span>}
          rows={data.history}
        />
      </Panel>
    </div>
  );
}
