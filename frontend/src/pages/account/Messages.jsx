import { useSearchParams } from "react-router-dom";

import { Container, Inbox, PageHeader } from "@/components";
import { useDocumentTitle } from "@/hooks";
import { EN } from "@/locales";

const B = EN.BUYER_HUB.MESSAGES;

export function Messages() {
  useDocumentTitle(B.TITLE);
  const [searchParams] = useSearchParams();
  const thread = searchParams.get("thread");
  return (
    <Container className="max-w-6xl space-y-5 pt-6">
      <PageHeader subtitle={B.SUBTITLE} title={B.TITLE} />
      <Inbox initialThreadId={thread} key={thread ?? "all"} />
    </Container>
  );
}
