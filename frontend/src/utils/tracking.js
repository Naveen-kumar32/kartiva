// SAMPLE shipment tracking for the demo: courier scan events derived from the sub-order's real timeline
// (placed → packed → shipped → delivered) and the seller/buyer cities. In production these come from the
// courier's tracking API / webhook (Shiprocket, Delhivery …) via the backend.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (sub, status) => sub.timeline.findLast?.((t) => t.status === status)?.at ?? [...sub.timeline].reverse().find((t) => t.status === status)?.at ?? null;

export const TRACK_STEPS = ["confirmed", "processing", "shipped", "out_for_delivery", "delivered"];

export function buildTracking(sub, { buyerCity, sellerCity, now = Date.now() }) {
  const placedAt = at(sub, "confirmed") ?? sub.createdAt;
  const packedAt = at(sub, "processing");
  const shippedAt = sub.shippedAt ?? at(sub, "shipped");
  const deliveredAt = sub.deliveredAt ?? at(sub, "delivered");
  const failedAt = at(sub, "undelivered");
  const cancelledAt = at(sub, "cancelled");
  const maxDays = sub.method?.maxDays ?? 5;
  const expectedBy = new Date(new Date(placedAt).getTime() + Math.max(1, maxDays) * DAY).toISOString();
  const local = ["store_pickup", "local_delivery"].includes(sub.method?.type);
  const carrier = local ? sub.method?.name : sub.carrier;
  const sameCity = buyerCity && sellerCity && buyerCity.toLowerCase() === sellerCity.toLowerCase();

  const events = [{ at: placedAt, key: "placed", location: "" }];
  if (packedAt) events.push({ at: packedAt, key: "packed", location: sellerCity });
  if (shippedAt) {
    const s = new Date(shippedAt).getTime();
    const end = deliveredAt ? new Date(deliveredAt).getTime() : failedAt ? new Date(failedAt).getTime() : s + Math.max(1, maxDays - 1) * DAY;
    const span = Math.max(6 * HOUR, end - s);
    if (sub.method?.type === "store_pickup") {
      events.push({ at: shippedAt, key: "ready_pickup", location: sellerCity });
    } else if (local) {
      events.push({ at: shippedAt, key: "out_local", location: buyerCity });
    } else {
      events.push({ at: shippedAt, key: "picked_up", location: sellerCity });
      [[0.12, "at_origin_hub", sellerCity], [0.25, "departed_origin", sellerCity], ...(sameCity ? [] : [[0.7, "at_destination_hub", buyerCity]]), [0.88, "out_for_delivery", buyerCity]]
        .forEach(([f, key, location]) => events.push({ at: new Date(s + span * f).toISOString(), key, location }));
    }
  }
  if (deliveredAt) events.push({ at: deliveredAt, key: sub.method?.type === "store_pickup" ? "collected" : "delivered", location: buyerCity });
  if (failedAt) events.push({ at: failedAt, key: "failed", location: buyerCity }, { at: failedAt, key: "rto", location: sellerCity });
  if (cancelledAt) events.push({ at: cancelledAt, key: "cancelled", location: "" });

  const visible = events.filter((e) => new Date(e.at).getTime() <= now || e.key === "delivered" || e.key === "collected").sort((a, b) => b.at.localeCompare(a.at));
  const keys = new Set(visible.map((e) => e.key));
  const step = deliveredAt ? 4 : keys.has("out_for_delivery") || keys.has("out_local") || keys.has("ready_pickup") ? 3 : shippedAt ? 2 : packedAt ? 1 : 0;
  return {
    awb: sub.trackingNumber && sub.trackingNumber !== "—" ? sub.trackingNumber : null, cancelled: Boolean(cancelledAt), carrier, deliveredAt, events: visible,
    expectedBy, failed: Boolean(failedAt), local, step,
  };
}
