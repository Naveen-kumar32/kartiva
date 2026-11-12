import { useMemo } from "react";
import { useSelector } from "react-redux";

import { selectCartItems } from "@/store/slices/cartSlice";
import { buildCartView } from "@/utils";

export function useCartView(shippingChoices) {
  const items = useSelector(selectCartItems);
  return useMemo(() => buildCartView(items, shippingChoices), [items, shippingChoices]);
}
