import { SearchX } from "lucide-react";

import { Container, EmptyState } from "@/components";
import { useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";

export function NotFound() {
  useDocumentTitle(EN.ERRORS.NOT_FOUND_TITLE);
  return (
    <Container className="py-16">
      <EmptyState actionLabel={EN.CART.CONTINUE_SHOPPING} actionTo={ROUTES.HOME} body={EN.ERRORS.NOT_FOUND_BODY} icon={SearchX} title={EN.ERRORS.NOT_FOUND_TITLE} />
    </Container>
  );
}
