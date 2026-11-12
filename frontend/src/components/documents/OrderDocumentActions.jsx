import { FileText, Mail, ReceiptText } from "lucide-react";
import { useState } from "react";

import { getOrderRefunds } from "@/api";
import { PLATFORM } from "@/data";
import { EN } from "@/locales";
import { getErrorMessage } from "@/utils/getErrorMessage";
import { errorToast } from "@/utils/toast";

import { Button } from "../ui";
import { EmailDocumentModal } from "./EmailDocumentModal";

const D = EN.DOCS;
// jsPDF is loaded only when a document is actually generated.
const docs = () => import("@/utils/documents");

/**
 * Letterhead order documents: order summary + payment receipt.
 * audience: "buyer" (download only — buyers already get every update by notification/email) | "seller" | "admin" (download or email the buyer). `subs` limits the summary to some shipments (seller view).
 */
export function OrderDocumentActions({ audience = "admin", order, size = "sm", subs }) {
  const [emailOpen, setEmailOpen] = useState(false);
  const showReceipt = audience !== "seller";
  const canEmail = audience !== "buyer";

  const makeSummary = async (output) => (await docs()).downloadOrderSummary({ order, platform: PLATFORM, subs }, { output });
  const makeReceipt = async (output) => (await docs()).downloadPaymentReceipt({ order, platform: PLATFORM, refunds: await getOrderRefunds(order.number) }, { output });
  const run = (fn) => fn().catch((err) => errorToast(getErrorMessage(err)));

  const documents = [
    { label: D.ORDER_SUMMARY, make: () => makeSummary("blob"), value: "summary" },
    ...(showReceipt ? [{ label: D.PAYMENT_RECEIPT, make: () => makeReceipt("blob"), value: "receipt" }] : []),
  ];
  const from = audience === "seller" ? subs?.[0]?.storeName ?? EN.APP.NAME : EN.APP.NAME;

  return (
    <>
      <Button onClick={() => run(() => makeSummary())} size={size} variant="outline"><FileText className="size-4" />{D.ORDER_SUMMARY}</Button>
      {showReceipt && <Button onClick={() => run(() => makeReceipt())} size={size} variant="outline"><ReceiptText className="size-4" />{D.PAYMENT_RECEIPT}</Button>}
      {canEmail && <Button onClick={() => setEmailOpen(true)} size={size} variant="subtle"><Mail className="size-4" />{D.EMAIL_BUYER}</Button>}
      {canEmail && emailOpen && (
        <EmailDocumentModal
          defaultMessage={D.ORDER_EMAIL_BODY(order.buyer.name.split(" ")[0], order.number, from)}
          defaultSubject={D.ORDER_EMAIL_SUBJECT(order.number)}
          defaultTo={order.buyer.email}
          documents={documents}
          onClose={() => setEmailOpen(false)}
          open
          sentBy={from}
        />
      )}
    </>
  );
}
