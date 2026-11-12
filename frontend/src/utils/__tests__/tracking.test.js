import { describe, expect, it } from "vitest";

import { buildTracking, TRACK_STEPS } from "../tracking";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.parse("2026-11-01T10:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();
const cities = { buyerCity: "Pune", sellerCity: "Surat" };
const courier = { maxDays: 5, name: "Standard", type: "courier" };

const makeSub = ({ method = courier, timeline = [], ...rest } = {}) => ({
  carrier: "Delhivery", createdAt: iso(T0), deliveredAt: null, method, shippedAt: null,
  timeline: [{ at: iso(T0), status: "confirmed" }, ...timeline], trackingNumber: "—", ...rest,
});
const keys = (t) => t.events.map((e) => e.key);

describe("buildTracking", () => {
  it("exposes the five buyer-facing steps", () => {
    expect(TRACK_STEPS).toEqual(["confirmed", "processing", "shipped", "out_for_delivery", "delivered"]);
  });

  it("confirmed: only the placed event, step 0, expected date from maxDays", () => {
    const t = buildTracking(makeSub(), { ...cities, now: T0 + HOUR });
    expect(keys(t)).toEqual(["placed"]);
    expect(t).toMatchObject({ awb: null, cancelled: false, carrier: "Delhivery", failed: false, local: false, step: 0 });
    expect(t.expectedBy).toBe(iso(T0 + 5 * DAY));
  });

  it("packed: step 1 with the seller city", () => {
    const t = buildTracking(makeSub({ timeline: [{ at: iso(T0 + 2 * HOUR), status: "processing" }] }), { ...cities, now: T0 + 3 * HOUR });
    expect(t.step).toBe(1);
    expect(t.events[0]).toEqual({ at: iso(T0 + 2 * HOUR), key: "packed", location: "Surat" });
  });

  it("shipped: hides future hub scans until they happen, newest event first", () => {
    const shippedAt = iso(T0 + DAY);
    const sub = makeSub({ shippedAt, timeline: [{ at: iso(T0 + 2 * HOUR), status: "processing" }], trackingNumber: "AWB123" });
    const early = buildTracking(sub, { ...cities, now: T0 + DAY + HOUR });
    expect(keys(early)).toEqual(["picked_up", "packed", "placed"]);
    expect(early.step).toBe(2);
    expect(early.awb).toBe("AWB123");

    const later = buildTracking(sub, { ...cities, now: T0 + 30 * DAY });
    expect(keys(later)).toEqual(["out_for_delivery", "at_destination_hub", "departed_origin", "at_origin_hub", "picked_up", "packed", "placed"]);
    expect(later.step).toBe(3);
  });

  it("skips the destination hub when buyer and seller share a city (case-insensitive)", () => {
    const sub = makeSub({ shippedAt: iso(T0 + DAY) });
    const t = buildTracking(sub, { buyerCity: "Surat", now: T0 + 30 * DAY, sellerCity: "surat" });
    expect(keys(t)).not.toContain("at_destination_hub");
    expect(keys(t)).toContain("out_for_delivery");
  });

  it("delivered: step 4, delivered event first even if 'now' is earlier", () => {
    const sub = makeSub({ deliveredAt: iso(T0 + 3 * DAY), shippedAt: iso(T0 + DAY) });
    const t = buildTracking(sub, { ...cities, now: T0 + 3 * DAY + HOUR });
    expect(t.step).toBe(4);
    expect(t.events[0]).toMatchObject({ key: "delivered", location: "Pune" });
    // scans are spread between ship and delivery
    const ofd = t.events.find((e) => e.key === "out_for_delivery");
    expect(Date.parse(ofd.at)).toBe(T0 + DAY + 0.88 * 2 * DAY);
  });

  it("cancelled: flagged with a cancelled event", () => {
    const t = buildTracking(makeSub({ timeline: [{ at: iso(T0 + HOUR), status: "cancelled" }] }), { ...cities, now: T0 + 2 * HOUR });
    expect(t.cancelled).toBe(true);
    expect(keys(t)).toEqual(["cancelled", "placed"]);
    expect(t.step).toBe(0);
  });

  it("undelivered: failed + RTO events", () => {
    const sub = makeSub({ shippedAt: iso(T0 + DAY), timeline: [{ at: iso(T0 + 3 * DAY), status: "undelivered" }] });
    const t = buildTracking(sub, { ...cities, now: T0 + 4 * DAY });
    expect(t.failed).toBe(true);
    expect(keys(t)).toEqual(expect.arrayContaining(["failed", "rto"]));
  });

  it("store_pickup: ready for pickup then collected, carrier is the method name", () => {
    const method = { maxDays: 2, name: "Pickup at store", type: "store_pickup" };
    const ready = buildTracking(makeSub({ method, shippedAt: iso(T0 + HOUR) }), { ...cities, now: T0 + 2 * HOUR });
    expect(keys(ready)).toEqual(["ready_pickup", "placed"]);
    expect(ready).toMatchObject({ carrier: "Pickup at store", local: true, step: 3 });
    expect(ready.events[0].location).toBe("Surat");

    const done = buildTracking(makeSub({ deliveredAt: iso(T0 + 5 * HOUR), method, shippedAt: iso(T0 + HOUR) }), { ...cities, now: T0 + DAY });
    expect(done.step).toBe(4);
    expect(done.events[0].key).toBe("collected");
  });

  it("local_delivery: a single out-for-local-delivery scan in the buyer city", () => {
    const method = { maxDays: 1, name: "Own van", type: "local_delivery" };
    const t = buildTracking(makeSub({ method, shippedAt: iso(T0 + HOUR) }), { ...cities, now: T0 + 2 * HOUR });
    expect(keys(t)).toEqual(["out_local", "placed"]);
    expect(t.events[0].location).toBe("Pune");
    expect(t.step).toBe(3);
  });
});
