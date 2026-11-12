// Order state machine + money side-effects for the mock DB (mirrors docs/SYSTEM_ARCHITECTURE §3.3–3.9).
// Used by orderApi (buyer), sellerApi and adminApi. Not exported from the api barrel.
import { stateCodeOf } from "@/constants/indianStates";
import { buildSubOrder, computeLedger, DAY_MS } from "@/utils/orderMath";
import { minOrderQty } from "@/utils/pricing";

import { notify } from "./marketOps";
import { apiError, commit, getDb, nextId, nowIso } from "./mockDb";

// ---------- Notifications for every order event (buyer · seller · admin) ----------
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const storeName = (slug) => getDb().stores.find((s) => s.slug === slug)?.name ?? slug;
const itemsLabel = (sub) => sub.items.map((i) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ");
const toBuyer = (order, title, body, link = "/account/orders") => notify({ email: order.buyer.email, role: "buyer" }, title, body, link);

// ---------- Customer messages: email (with PDF attachments) + SMS / WhatsApp, per the customer's preferences ----------
// Attachments are stored as a recipe ({ kind, orderNumber, subOrderNumber }) and the PDF is generated on download
// (Admin → Letters & mail → Outbox). In production the backend renders the PDF and sends via SMTP / SMS gateway.
const DEFAULT_PREFS = { email: true, sms: true, whatsapp: false };
export const prefsOf = (email) => ({ ...DEFAULT_PREFS, ...(getDb().users.find((u) => u.email === email)?.notificationPrefs ?? {}) });
function mailBuyer(order, { attachments = [], lines, subject }) {
  const db = getDb();
  if (!prefsOf(order.buyer.email).email) return;
  db.outbox.unshift({
    attachment: attachments[0] ?? null, attachments, cc: null, id: nextId(db.outbox), sentAt: nowIso(), sentBy: "Kartiva (automatic)", status: "sent", subject,
    message: [`Hello ${order.buyer.name.split(" ")[0]},`, "", ...lines, "", "Track your order any time in My orders on Kartiva.", "— Team Kartiva"].join("\n"),
    to: [order.buyer.email],
  });
}
function textBuyer(order, text) {
  const db = getDb();
  const prefs = prefsOf(order.buyer.email);
  const phone = order.buyer.phone || order.address?.phone;
  if (!phone) return;
  const to = String(phone).startsWith("+") ? phone : `+91${phone}`;
  [["sms", prefs.sms], ["whatsapp", prefs.whatsapp]].filter(([, on]) => on).forEach(([channel]) => {
    db.smsOutbox.unshift({ channel, id: nextId(db.smsOutbox), sentAt: nowIso(), status: "sent", text: `Kartiva: ${text}`.slice(0, 300), to });
  });
}
const att = (kind, order, sub = null) => ({ filename: `${kind === "invoice" ? "GST-invoice" : kind === "receipt" ? "Payment-receipt" : "Order-summary"}-${sub?.number ?? order.number}.pdf`, kind, orderNumber: order.number, subOrderNumber: sub?.number ?? null });
const toSeller = (slug, title, body, link = "/seller/orders") => notify({ role: "seller", storeSlug: slug }, title, body, link);
const toAdmin = (title, body, link = "/admin/orders") => notify({ role: "admin" }, title, body, link);

export const TRANSITIONS = {
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "undelivered"],
};

export const RETURN_REASONS = ["damaged", "defective", "wrong_item", "not_as_described", "size_fit", "changed_mind", "other"];

export function findSubOrder(subOrderNumber) {
  for (const order of getDb().orders) {
    const sub = order.subOrders.find((s) => s.number === subOrderNumber);
    if (sub) return { order, sub };
  }
  throw apiError("Sub-order not found.", 404);
}

function findVariant(variantId) {
  for (const product of getDb().products) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) return { product, variant };
  }
  return null;
}

export function moveStock({ actor = "system", delta, note, reason, subOrderNumber = null, variantId }) {
  const found = findVariant(variantId);
  if (!found) return;
  const { product, variant } = found;
  if (variant.stock + delta < 0) throw apiError(`Only ${variant.stock} left of ${product.name}.`, 409);
  const before = variant.stock;
  variant.stock += delta;
  const db = getDb();
  const threshold = db.platform.lowStockThreshold ?? 3;
  if (delta < 0 && before > threshold && variant.stock <= threshold) {
    toSeller(product.storeSlug, variant.stock === 0 ? "Out of stock" : "Low stock", `${product.name}${variant.sku ? ` (${variant.sku})` : ""} — ${variant.stock} left. Restock to keep selling.`, "/seller/inventory");
  }
  db.stockMovements.unshift({ actor, at: nowIso(), delta, id: nextId(db.stockMovements), note, productId: product.id, productName: product.name, reason, sku: variant.sku, stockAfter: variant.stock, storeSlug: product.storeSlug, subOrderNumber, variantId });
}

const nextDocNumber = (storeSlug, kind) => {
  const db = getDb();
  const store = db.stores.find((s) => s.slug === storeSlug);
  const prefix = kind === "credit" ? `${store.initials}CN` : store.initials;
  const existing = kind === "credit"
    ? db.returns.filter((r) => r.storeSlug === storeSlug && r.creditNoteNumber).length
    : db.orders.flatMap((o) => o.subOrders).filter((s) => s.storeSlug === storeSlug && s.invoiceNumber).length;
  return `${prefix}/26-27/${String(existing + 1).padStart(5, "0")}`;
};

function syncOrderStatus(order) {
  const subs = order.subOrders;
  if (order.paymentMethod === "cod") {
    const live = subs.filter((s) => s.status !== "cancelled" && s.status !== "undelivered");
    order.paymentStatus = live.length && live.every((s) => s.status === "delivered") ? "cod_collected" : live.some((s) => s.status === "delivered") ? "cod_partially_collected" : "cod_pending";
  } else {
    const refunded = subs.reduce((s, x) => s + (x.refundedAmount ?? 0), 0);
    order.paymentStatus = refunded === 0 ? "paid" : refunded >= order.grandTotal ? "refunded" : "partially_refunded";
  }
}

export function createRefund({ amount, order, reason, returnId = null, sub }) {
  const db = getDb();
  const online = order.paymentMethod === "online";
  // COD refunds after cash was collected go to the admin's bank-transfer queue.
  if (!online && sub.status !== "delivered") return null; // nothing was paid yet
  const refund = {
    amount, createdAt: nowIso(), id: nextId(db.refunds), method: online ? "gateway" : "bank_transfer", orderNumber: order.number,
    payoutTo: online ? null : `${order.buyer.name.split(" ")[0].toLowerCase()}@upi`, processedAt: online ? nowIso() : null, reason, returnId,
    status: online ? "processed" : "pending", storeSlug: sub.storeSlug, subOrderNumber: sub.number, utr: online ? `rfnd_${Date.now().toString(36)}` : null,
  };
  db.refunds.unshift(refund);
  if (online) sub.refundedAmount = (sub.refundedAmount ?? 0) + amount;
  if (online) {
    toBuyer(order, "Refund processed", `${inr(amount)} for ${sub.number} has been refunded to your original payment method. It reaches your account in 1–7 working days.`);
    textBuyer(order, `Refund of ${inr(amount)} for ${sub.number} processed. It reaches your account in 1–7 working days.`);
  }
  else {
    toBuyer(order, "Refund initiated", `${inr(amount)} for ${sub.number} will be paid to ${refund.payoutTo} by bank transfer within 5–7 working days.`);
    toAdmin("COD refund to pay", `${order.buyer.name}: ${inr(amount)} for ${sub.number} — pay by bank transfer and enter the UTR.`, "/admin/returns");
  }
  return refund;
}

export function transitionSubOrder(subOrderNumber, toStatus, { actor = "seller", carrier, note, trackingNumber } = {}) {
  const { order, sub } = findSubOrder(subOrderNumber);
  const allowed = TRANSITIONS[sub.status] ?? [];
  if (!allowed.includes(toStatus)) throw apiError(`Can't move from ${sub.status} to ${toStatus}.`, 409);
  if (toStatus === "shipped" && sub.method.type !== "store_pickup" && sub.method.type !== "local_delivery" && (!carrier || !trackingNumber)) {
    throw apiError("Carrier and tracking number are required to mark as shipped.");
  }
  const at = nowIso();
  if (toStatus === "shipped") {
    Object.assign(sub, { carrier: carrier || sub.method.name, shippedAt: at, trackingNumber: trackingNumber || "—" });
    sub.invoiceNumber ??= nextDocNumber(sub.storeSlug, "invoice");
  }
  if (toStatus === "delivered") sub.deliveredAt = at;
  if (toStatus === "cancelled" || toStatus === "undelivered") {
    sub.cancelReason = note ?? null;
    sub.items.forEach((it) => moveStock({ actor, delta: it.quantity, note: `${toStatus} · ${sub.number}`, reason: "order_released", subOrderNumber: sub.number, variantId: it.variantId }));
    if (toStatus === "cancelled") createRefund({ amount: sub.total - (sub.refundedAmount ?? 0), order, reason: `${actor}_cancelled`, sub });
  }
  sub.status = toStatus;
  sub.timeline.push({ at, by: actor, note: toStatus === "shipped" ? `${sub.carrier} · ${sub.trackingNumber}` : note, status: toStatus });
  syncOrderStatus(order);
  const shop = storeName(sub.storeSlug);
  if (toStatus === "processing") toBuyer(order, "Your order is being packed", `${shop} is packing ${sub.number} (${itemsLabel(sub)}).`);
  if (toStatus === "shipped") {
    const track = sub.trackingNumber && sub.trackingNumber !== "—" ? `${sub.carrier} ${sub.trackingNumber}` : sub.carrier;
    mailBuyer(order, { attachments: [att("invoice", order, sub)], lines: [`Good news — ${itemsLabel(sub)} from ${shop} has shipped.`, track ? `Courier: ${track}` : "", `Order: ${sub.number}`, "", "Your GST tax invoice is attached."].filter((l) => l !== ""), subject: `Shipped — ${sub.number}` });
    textBuyer(order, `${sub.number} shipped${track ? ` via ${track}` : ""}. Track in My orders.`);
    toBuyer(order, "Shipped", `${sub.number} from ${shop} is on its way${sub.trackingNumber && sub.trackingNumber !== "—" ? ` via ${sub.carrier} · ${sub.trackingNumber}` : ""}. Track it in My orders.`);
  }
  if (toStatus === "delivered") {
    mailBuyer(order, { attachments: [att("invoice", order, sub)], lines: [`${itemsLabel(sub)} from ${shop} was delivered.`, `Order: ${sub.number}`, "", `Not happy with it? You can request a return within ${getDb().platform.defaultReturnWindowDays} days from My orders.`], subject: `Delivered — ${sub.number}` });
    textBuyer(order, `${sub.number} delivered. Thank you for shopping on Kartiva!`);
    toBuyer(order, "Delivered", `${sub.number} from ${shop} was delivered. Enjoy! You can rate the product or request a return within ${getDb().platform.defaultReturnWindowDays} days.`);
    toSeller(sub.storeSlug, "Order delivered", `${sub.number} delivered to ${order.buyer.name}${order.paymentMethod === "cod" ? ` — COD ${inr(sub.total)} collected` : ""}.`);
  }
  if (toStatus === "cancelled") {
    if (actor === "buyer") {
      mailBuyer(order, { lines: [`You cancelled ${sub.number} (${itemsLabel(sub)}).`, order.paymentMethod === "online" ? `Your refund of ${inr(sub.total)} has been processed.` : "Nothing was charged."], subject: `Cancellation confirmed — ${sub.number}` });
      toSeller(sub.storeSlug, "Order cancelled by buyer", `${order.buyer.name} cancelled ${sub.number} (${itemsLabel(sub)}). Stock has been released — don't ship it.`);
    } else {
      toBuyer(order, "Order cancelled", `${sub.number} from ${shop} was cancelled${note ? `: ${note}` : ""}. ${order.paymentMethod === "online" ? "Your refund has been processed." : "Nothing was charged."}`);
      mailBuyer(order, { lines: [`${sub.number} (${itemsLabel(sub)}) from ${shop} was cancelled${note ? ` — ${note}` : ""}.`, order.paymentMethod === "online" ? `A refund of ${inr(sub.total)} has been processed to your original payment method.` : "Nothing was charged for this item."], subject: `Cancelled — ${sub.number}` });
      textBuyer(order, `${sub.number} was cancelled by the seller.${order.paymentMethod === "online" ? ` Refund of ${inr(sub.total)} processed.` : ""}`);
      if (actor === "admin") toSeller(sub.storeSlug, "Order cancelled by Kartiva", `${sub.number} was cancelled by the Kartiva team${note ? `: ${note}` : ""}.`);
    }
    toAdmin("Order cancelled", `${sub.number} (${shop}) cancelled by ${actor}${note ? ` — ${note}` : ""}.`);
  }
  if (toStatus === "undelivered") {
    toBuyer(order, "Delivery unsuccessful", `${sub.number} couldn't be delivered and is returning to ${shop}.${order.paymentMethod === "online" ? " A refund will follow." : ""}`);
    toAdmin("Undelivered shipment", `${sub.number} (${shop}) marked undelivered${note ? ` — ${note}` : ""}. Check the buyer for COD refusals.`);
  }
  commit();
  return { order, sub };
}

export function placeOrderInDb({ address, buyer, gstin, lines, paymentMethod, shippingChoices }) {
  const db = getDb();
  const groups = new Map();
  for (const line of lines) {
    const found = findVariant(line.variantId);
    if (!found) throw apiError("An item in your cart is no longer available.", 409);
    const quantity = Math.floor(Number(line.quantity));
    if (!(quantity > 0)) throw apiError("Invalid quantity in your cart.", 400);
    if (found.product.enquiryOnly) throw apiError(`${found.product.name} is sold on enquiry only — send an enquiry to the seller instead.`, 409);
    if (found.product.status !== "active" || found.product.deletedAt) throw apiError("An item in your cart is no longer available.", 409);
    if (quantity < minOrderQty(found.product)) throw apiError(`Minimum order quantity for ${found.product.name} is ${minOrderQty(found.product)}.`, 409);
    if (found.variant.stock < quantity) throw apiError(`Only ${found.variant.stock} left of ${found.product.name}.`, 409);
    const list = groups.get(found.product.storeSlug) ?? [];
    list.push({ ...found, quantity }); // price is recomputed from the catalogue in buildSubOrder
    groups.set(found.product.storeSlug, list);
  }
  const d = new Date();
  const number = `KTV-${String(d.getFullYear()).slice(2)}${d.getMonth() + 1}${d.getDate()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const buyerStateCode = stateCodeOf(address.state);
  const subOrders = [...groups.entries()].map(([slug, groupLines], i) => {
    const store = db.stores.find((s) => s.slug === slug);
    const method = store.shippingMethods.find((m) => m.id === shippingChoices[slug]) ?? store.shippingMethods[0];
    const sub = buildSubOrder({ buyerStateCode, categories: db.categories, lines: groupLines, method, number: `${number}-${i + 1}`, rules: db.commissionRules, store });
    sub.timeline.push({ at: nowIso(), note: paymentMethod === "cod" ? "Order placed (COD)" : "Payment captured", status: "confirmed" });
    return sub;
  });
  subOrders.forEach((sub) => sub.items.forEach((it) => moveStock({ actor: "buyer", delta: -it.quantity, note: "Checkout", reason: "order_reserved", subOrderNumber: sub.number, variantId: it.variantId })));
  const order = {
    address, buyer, createdAt: nowIso(), gstin: gstin ?? "", grandTotal: subOrders.reduce((s, x) => s + x.total, 0), number,
    paymentMethod, paymentStatus: paymentMethod === "cod" ? "cod_pending" : "paid", subOrders,
  };
  db.orders.unshift(order);
  toBuyer(order, "Order placed", `${number} — ${inr(order.grandTotal)}${paymentMethod === "cod" ? " (Cash on Delivery)" : " paid"}. ${subOrders.length > 1 ? `${subOrders.length} sellers will ship separately.` : "We'll tell you when it ships."}`);
  mailBuyer(order, {
    attachments: [att("summary", order), ...(paymentMethod === "online" ? [att("receipt", order)] : [])],
    lines: [`Thank you for your order ${number}.`, "", ...subOrders.map((x) => `• ${storeName(x.storeSlug)}: ${itemsLabel(x)} — ${inr(x.total)} (${x.method.name})`), "", `Total: ${inr(order.grandTotal)} · ${paymentMethod === "cod" ? "Cash on Delivery" : "Paid online"}`, `Delivering to: ${address.fullName}, ${address.line1}, ${address.city} ${address.pincode}`, "", "Your order summary is attached."],
    subject: `Order confirmed — ${number}`,
  });
  textBuyer(order, `Order ${number} confirmed. Total ${inr(order.grandTotal)}${paymentMethod === "cod" ? " (COD)" : ""}. We'll message you when it ships.`);
  subOrders.forEach((s) => toSeller(s.storeSlug, "New order received", `${s.number}: ${itemsLabel(s)} — ${inr(s.total)}${paymentMethod === "cod" ? " · COD" : " · Paid"} · ${s.method.name}. Deliver to ${address.city}.`, `/seller/orders?order=${s.number}`));
  toAdmin("New order", `${number} by ${buyer.name} (${address.city}) — ${inr(order.grandTotal)} from ${subOrders.map((s) => storeName(s.storeSlug)).join(", ")}.`, `/admin/orders?order=${number}`);
  if (!db.buyers.some((b) => b.email === buyer.email)) {
    db.buyers.unshift({ address, codBlocked: false, email: buyer.email, id: nextId(db.buyers), isActive: true, joinedAt: nowIso(), name: buyer.name });
  }
  commit();
  return order;
}

// ---------- Returns ----------
export function requestReturnInDb({ description, payoutTo, quantity = 1, reasonCode, subOrderNumber, variantId }) {
  const db = getDb();
  const { order, sub } = findSubOrder(subOrderNumber);
  if (sub.status !== "delivered") throw apiError("Only delivered items can be returned.");
  const item = sub.items.find((i) => i.variantId === variantId);
  if (!item) throw apiError("Item not found in this shipment.", 404);
  if (item.isReturnable === false) throw apiError("This item is not returnable.");
  if (quantity > item.quantity - (item.returnedQuantity ?? 0)) throw apiError("You can't return more than you bought.");
  if (Date.now() - new Date(sub.deliveredAt).getTime() > db.platform.defaultReturnWindowDays * DAY_MS) throw apiError("The return window for this item has closed.");
  if (db.returns.some((r) => r.subOrderNumber === subOrderNumber && r.items[0].variantId === variantId && !["rejected", "cancelled", "refunded"].includes(r.status))) {
    throw apiError("A return for this item is already in progress.", 409);
  }
  const ret = {
    buyer: order.buyer, createdAt: nowIso(), description, escalated: false, id: nextId(db.returns),
    items: [{ name: item.name, quantity, variantId, variantLabel: item.variantLabel }], number: `RET-${sub.number.slice(4)}-${db.returns.length + 1}`,
    orderNumber: order.number, paymentMethod: order.paymentMethod, payoutTo: payoutTo || null, reasonCode,
    refundAmount: item.price * quantity + (["damaged", "defective", "wrong_item"].includes(reasonCode) && sub.items.length === 1 ? sub.fee : 0),
    rejectionReason: null, status: "requested", storeSlug: sub.storeSlug, subOrderNumber, timeline: [{ at: nowIso(), status: "requested" }],
  };
  db.returns.unshift(ret);
  toSeller(sub.storeSlug, "Return requested", `${order.buyer.name} wants to return ${item.name}${quantity > 1 ? ` ×${quantity}` : ""} from ${sub.number} — ${reasonCode.replace(/_/g, " ")}. Approve or reject within 48 hours.`, "/seller/returns");
  toBuyer(order, "Return request submitted", `${ret.number} for ${item.name}. ${storeName(sub.storeSlug)} will respond within 48 hours.`);
  commit();
  return ret;
}

export function updateReturnInDb(id, action, { actor = "seller", note, reason, restock = true, trackingNumber } = {}) {
  const db = getDb();
  const ret = db.returns.find((r) => r.id === id);
  if (!ret) throw apiError("Return not found.", 404);
  const at = nowIso();
  const allowed = {
    approve: ["requested"], cancel: ["requested"], escalate: ["rejected"], override: ["rejected"],
    receive: ["approved", "in_transit"], reject: ["requested"], ship_back: ["approved"],
  }[action];
  if (!allowed?.includes(ret.status)) throw apiError(`Can't ${action.replace("_", " ")} a return that is ${ret.status}.`, 409);

  if (action === "approve" || action === "override") { ret.status = "approved"; ret.escalated = false; }
  if (action === "reject") { ret.status = "rejected"; ret.rejectionReason = reason; }
  if (action === "escalate") ret.escalated = true;
  if (action === "cancel") ret.status = "cancelled";
  if (action === "ship_back") { ret.status = "in_transit"; ret.returnTracking = trackingNumber; }
  if (action === "receive") {
    const { order, sub } = findSubOrder(ret.subOrderNumber);
    const item = sub.items.find((i) => i.variantId === ret.items[0].variantId);
    item.returnedQuantity = (item.returnedQuantity ?? 0) + ret.items[0].quantity;
    if (restock) moveStock({ actor, delta: ret.items[0].quantity, note: `Return ${ret.number}`, reason: "return_restock", subOrderNumber: sub.number, variantId: item.variantId });
    const refund = createRefund({ amount: ret.refundAmount, order, reason: "return", returnId: ret.id, sub });
    ret.creditNoteNumber = nextDocNumber(ret.storeSlug, "credit");
    ret.status = refund?.status === "processed" ? "refunded" : "received";
    syncOrderStatus(order);
  }
  ret.timeline.push({ at, by: actor, note: reason ?? note ?? (trackingNumber ? `Tracking ${trackingNumber}` : undefined), status: action === "escalate" ? "escalated" : ret.status });
  const buyerOrder = { buyer: ret.buyer };
  const what = `${ret.number} (${ret.items[0].name})`;
  const shop = storeName(ret.storeSlug);
  if (["approve", "reject", "receive"].includes(action)) {
    const verdict = { approve: `Your return ${what} was approved by ${shop}.`, receive: `${shop} received your return ${what}.`, reject: `Your return ${what} was not approved by ${shop}${reason ? `: ${reason}` : ""}. You can escalate it to Kartiva from My orders.` }[action];
    mailBuyer(buyerOrder, { lines: [verdict], subject: `Return update — ${ret.number}` });
  }
  if (action === "approve") toBuyer(buyerOrder, "Return approved", `${what} was approved by ${shop}. ${trackingNumber ? "" : "Pickup will be arranged, or ship it back with the return address shown."}`);
  if (action === "override") {
    toBuyer(buyerOrder, "Return approved by Kartiva", `We reviewed ${what} and approved your return.`);
    toSeller(ret.storeSlug, "Return approved by Kartiva", `Kartiva overrode the rejection of ${what} after the buyer escalated it.`, "/seller/returns");
  }
  if (action === "reject") toBuyer(buyerOrder, "Return rejected", `${shop} rejected ${what}${reason ? `: ${reason}` : ""}. You can escalate it to Kartiva from My orders.`);
  if (action === "escalate") {
    toAdmin("Return escalated", `${ret.buyer.name} escalated ${what} against ${shop}. Review and decide.`, "/admin/returns");
    toSeller(ret.storeSlug, "Return escalated to Kartiva", `${ret.buyer.name} escalated ${what}. Kartiva will review it.`, "/seller/returns");
  }
  if (action === "cancel") toSeller(ret.storeSlug, "Return cancelled", `${ret.buyer.name} cancelled ${what}.`, "/seller/returns");
  if (action === "ship_back") toSeller(ret.storeSlug, "Return on its way", `${what} is being shipped back${trackingNumber ? ` · ${trackingNumber}` : ""}.`, "/seller/returns");
  if (action === "receive") toBuyer(buyerOrder, "Return received", `${shop} received ${what}. ${ret.status === "refunded" ? "Your refund has been processed." : "Your refund is being paid by bank transfer."}`);
  commit();
  return ret;
}

export function markRefundPaidInDb(id, utr) {
  const db = getDb();
  const refund = db.refunds.find((r) => r.id === id);
  if (!refund) throw apiError("Refund not found.", 404);
  if (!utr?.trim()) throw apiError("Enter the bank UTR / reference number.");
  Object.assign(refund, { processedAt: nowIso(), status: "processed", utr: utr.trim() });
  const ret = refund.returnId && db.returns.find((r) => r.id === refund.returnId);
  if (ret) { ret.status = "refunded"; ret.timeline.push({ at: nowIso(), note: `Bank transfer ${utr}`, status: "refunded" }); }
  const order = db.orders.find((o) => o.number === refund.orderNumber);
  if (order) {
    textBuyer(order, `Refund of ${inr(refund.amount)} for ${refund.subOrderNumber} sent · UTR ${utr.trim()}.`);
    mailBuyer(order, { lines: [`We've paid your refund of ${inr(refund.amount)} for ${refund.subOrderNumber}.`, `Paid to: ${refund.payoutTo ?? "your account"}`, `Bank reference (UTR): ${utr.trim()}`], subject: `Refund paid — ${refund.subOrderNumber}` });
  }
  if (order) toBuyer(order, "Refund paid", `${inr(refund.amount)} for ${refund.subOrderNumber} was sent to ${refund.payoutTo ?? "your account"} · UTR ${utr.trim()}.`);
  commit();
  return refund;
}

// ---------- Ledger & settlements ----------
export function ledgerFor(storeSlug) {
  const db = getDb();
  return computeLedger({ ads: db.ads, orders: db.orders, platform: db.platform, refunds: db.refunds, returnWindowDays: db.platform.defaultReturnWindowDays, settlements: db.settlements, storeSlug });
}

export function generateSettlementInDb(storeSlug) {
  const db = getDb();
  const { entries } = ledgerFor(storeSlug);
  const open = entries.filter((e) => !e.settlementId && e.type !== "payout");
  if (!open.length) throw apiError("Nothing to settle for this store yet.", 409);
  const carried = db.settlements.filter((s) => s.storeSlug === storeSlug && s.status === "carried_forward" && !s.carriedInto).reduce((t, s) => t + s.net, 0);
  const net = Math.round((open.reduce((t, e) => t + e.amount, 0) + carried) * 100) / 100;
  const id = nextId(db.settlements);
  const settlement = {
    breakdown: open.reduce((acc, e) => ({ ...acc, [e.type]: Math.round(((acc[e.type] ?? 0) + e.amount) * 100) / 100 }), {}),
    carriedIn: carried, createdAt: nowIso(), id, net, number: `STL-${String(40 + id).padStart(4, "0")}`, paidAt: null,
    periodEnd: nowIso().slice(0, 10), status: net > 0 ? "approved" : "carried_forward", storeSlug,
    subOrderNumbers: [...new Set(open.map((e) => e.subOrderNumber).filter(Boolean))], utr: null,
  };
  db.settlements.filter((s) => s.storeSlug === storeSlug && s.status === "carried_forward" && !s.carriedInto).forEach((s) => { s.carriedInto = id; });
  // Lock the included sub-orders, refunds and ads to this settlement
  db.orders.forEach((o) => o.subOrders.forEach((s) => { if (settlement.subOrderNumbers.includes(s.number)) s.settlementId = id; }));
  db.refunds.forEach((r) => { if (r.storeSlug === storeSlug && r.status === "processed" && !r.settlementId) r.settlementId = id; });
  db.ads.forEach((a) => { if (a.storeSlug === storeSlug && a.advertiserType === "seller" && a.spend > 0 && !a.settlementId) a.settlementId = id; });
  db.settlements.unshift(settlement);
  toSeller(storeSlug, settlement.status === "approved" ? "Settlement generated" : "Balance carried forward", `${settlement.number}: ${inr(net)} for ${settlement.subOrderNumbers.length} order${settlement.subOrderNumbers.length === 1 ? "" : "s"}.${settlement.status === "approved" ? " Payout will be sent to your bank account." : ""}`, "/seller/earnings");
  commit();
  return settlement;
}

export function markSettlementPaidInDb(id, utr) {
  const db = getDb();
  const s = db.settlements.find((x) => x.id === id);
  if (!s) throw apiError("Settlement not found.", 404);
  if (s.status !== "approved") throw apiError("Only approved settlements can be marked paid.", 409);
  if (!utr?.trim()) throw apiError("Enter the bank UTR / reference number.");
  Object.assign(s, { paidAt: nowIso(), status: "paid", utr: utr.trim() });
  toSeller(s.storeSlug, "Payout sent", `${s.number}: ${inr(s.net)} transferred to your bank account · UTR ${utr.trim()}.`, "/seller/earnings");
  commit();
  return s;
}
