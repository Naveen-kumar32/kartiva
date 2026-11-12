import { Heart, LayoutGrid, LifeBuoy, MessageSquareQuote, MessagesSquare, Package, UserCog } from "lucide-react";

import { EN, ROUTES } from "@/locales";

const N = EN.BUYER_HUB.NAV;
export const ACCOUNT_LINKS = [
  [LayoutGrid, EN.NAV.MY_ACCOUNT, ROUTES.ACCOUNT.HOME],
  [Package, EN.NAV.MY_ORDERS, ROUTES.ACCOUNT.ORDERS],
  [MessageSquareQuote, N.ENQUIRIES, ROUTES.ACCOUNT.ENQUIRIES],
  [MessagesSquare, N.MESSAGES, ROUTES.ACCOUNT.MESSAGES],
  [Heart, N.WISHLIST, ROUTES.ACCOUNT.WISHLIST],
  [UserCog, N.PROFILE, ROUTES.ACCOUNT.PROFILE],
  [LifeBuoy, N.SUPPORT, ROUTES.ACCOUNT.SUPPORT],
];

