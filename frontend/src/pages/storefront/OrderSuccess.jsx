import { motion } from "framer-motion";
import { CircleCheck, SearchX, Truck } from "lucide-react";
import { useParams } from "react-router-dom";

import { getOrder } from "@/api";
import { Button, Container, EmptyState, PageLoader } from "@/components";
import { useAsync, useDocumentTitle } from "@/hooks";
import { EN, ROUTES } from "@/locales";
import { formatCurrency } from "@/utils/format";

export function OrderSuccess() {
  const { orderNumber } = useParams();
  const { data: order, error, loading } = useAsync(() => getOrder(orderNumber), [orderNumber]);
  useDocumentTitle(EN.ORDER.SUCCESS_TITLE);
  if (loading) return <PageLoader />;
  // Not your order (or doesn't exist) → the API answers 404; never confirm someone else's order.
  if (error || !order) {
    return <Container className="py-16"><EmptyState actionLabel={EN.ORDER.VIEW_ORDERS} actionTo={ROUTES.ACCOUNT.ORDERS} icon={SearchX} title={EN.ERRORS.NOT_FOUND_TITLE} /></Container>;
  }
  return (
    <Container className="max-w-2xl pt-10">
      <motion.div animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-white p-6 text-center shadow-card sm:p-10" initial={{ opacity: 0, y: 12 }}>
        <motion.span animate={{ scale: 1 }} className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-50" initial={{ scale: 0.6 }} transition={{ delay: 0.1, type: "spring" }}>
          <CircleCheck aria-hidden className="size-10 text-emerald-600" />
        </motion.span>
        <h1 className="mt-4 text-2xl font-bold">{EN.ORDER.SUCCESS_TITLE}</h1>
        <p className="mt-1 font-mono text-sm text-muted">{orderNumber}</p>
        {order && (
          <>
            <p className="mx-auto mt-3 max-w-md text-sm text-muted">{EN.ORDER.SUCCESS_BODY(order.subOrders.length)}</p>
            <ul className="mt-6 space-y-2 text-left">
              {order.subOrders.map((s) => (
                <li className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm" key={s.number}>
                  <Truck aria-hidden className="size-5 text-brand-600" />
                  <span className="flex-1"><b>{s.storeName}</b><span className="block text-xs text-muted">{s.number} · {s.method.name} · {EN.COMMON.DAYS(s.method.minDays, s.method.maxDays)}</span></span>
                  <span className="font-semibold tabular">{formatCurrency(s.total)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm">{order.paymentMethod === "cod" ? EN.ORDER.METHOD_COD : EN.ORDER.METHOD_ONLINE} · <b>{formatCurrency(order.grandTotal)}</b></p>
          </>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button to={ROUTES.ACCOUNT.ORDERS}>{EN.ORDER.VIEW_ORDERS}</Button>
          <Button to={ROUTES.HOME} variant="outline">{EN.CART.CONTINUE_SHOPPING}</Button>
        </div>
      </motion.div>
    </Container>
  );
}
