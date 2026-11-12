import { useSearchParams } from "react-router-dom";

import { Inbox, PageHeader } from "@/components";
import { useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";

export function SellerMessages() {
  useDocumentTitle(EN.SELLER.NAV_MESSAGES);
  const [searchParams] = useSearchParams();
  return (
    <div className="space-y-6">
      <PageHeader subtitle={EN.SELLER_PRO.MESSAGES.SUBTITLE} title={EN.SELLER.NAV_MESSAGES} />
      <Inbox initialThreadId={searchParams.get("thread")} key={searchParams.get("thread") ?? "inbox"} />
    </div>
  );
}
