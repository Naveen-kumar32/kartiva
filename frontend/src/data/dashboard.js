// Sample figures for the seller & admin dashboards (demo only).
export const MONTHS = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];

export const SELLER_DASHBOARD = {
  storeSlug: "technest",
  kpis: { todaySales: 184_350, monthSales: 2_946_800, monthOrders: 412, pendingOrders: 18, balance: 312_440, nextPayout: "2026-11-14" },
  salesByMonth: [1_120_000, 1_480_000, 1_910_000, 2_230_000, 3_480_000, 2_946_800],
  recentOrders: [
    { number: "KTV-26111-8F3K2Q-1", buyer: "Priya R.", city: "Chennai", items: 1, total: 54_999, method: "online", status: "confirmed", placedAt: "2026-11-11T09:12:00Z" },
    { number: "KTV-26111-7HD2LA-2", buyer: "Rahul S.", city: "Pune", items: 2, total: 1_25_498, method: "online", status: "processing", placedAt: "2026-11-11T07:40:00Z" },
    { number: "KTV-26110-Q2MZ8C-1", buyer: "Fatima K.", city: "Hyderabad", items: 1, total: 18_499, method: "cod", status: "shipped", placedAt: "2026-11-10T16:05:00Z" },
    { number: "KTV-26110-LP9W3E-3", buyer: "Vikram N.", city: "Kolkata", items: 1, total: 89_999, method: "online", status: "shipped", placedAt: "2026-11-10T11:22:00Z" },
    { number: "KTV-26109-ZX81NM-1", buyer: "Ananya G.", city: "Bengaluru", items: 3, total: 23_997, method: "cod", status: "delivered", placedAt: "2026-11-09T13:48:00Z" },
    { number: "KTV-26108-RT55YH-2", buyer: "Imran A.", city: "Lucknow", items: 1, total: 41_999, method: "online", status: "cancelled", placedAt: "2026-11-08T18:30:00Z" },
  ],
  ledger: [
    { date: "2026-11-10", type: "sale", description: "Sub-order KTV-26103-AB12CD-1", amount: 54_999 },
    { date: "2026-11-10", type: "commission", description: "Commission 8% (store rate)", amount: -4_399.92 },
    { date: "2026-11-10", type: "commission_gst", description: "GST 18% on commission", amount: -791.99 },
    { date: "2026-11-10", type: "tcs", description: "TCS 0.5% on taxable value", amount: -233.05 },
    { date: "2026-11-09", type: "cod_collected_by_seller", description: "COD collected — KTV-26102-HH71KQ-2", amount: -18_499 },
    { date: "2026-11-08", type: "ad_charge", description: "Sponsored products · 7 Nov", amount: -1_096 },
    { date: "2026-11-07", type: "payout", description: "Settlement STL-0042 · UTR HDFC0000918273", amount: -286_120 },
  ],
};

export const ADMIN_DASHBOARD = {
  kpis: {
    gmv: 18_640_500, orders: 4_812, aov: 3_874, buyers: 21_430,
    commissionRevenue: 1_602_300, adRevenue: 412_900, pendingSellers: 3, pendingProducts: 14, openReturns: 22, codRefundQueue: 5,
  },
  revenueByMonth: {
    commission: [610_000, 780_000, 940_000, 1_120_000, 1_840_000, 1_602_300],
    ads: [0, 45_000, 120_000, 210_000, 365_000, 412_900],
  },
  paymentMix: [
    { method: "UPI", share: 52 }, { method: "Cash on Delivery", share: 21 }, { method: "Cards", share: 17 },
    { method: "Net banking", share: 6 }, { method: "EMI / Pay Later", share: 4 },
  ],
  topStores: [
    { slug: "technest", gmv: 5_120_400, orders: 812, commissionRate: 8 },
    { slug: "urbanthread", gmv: 3_410_900, orders: 1_204, commissionRate: 12 },
    { slug: "spice-route", gmv: 2_208_300, orders: 1_590, commissionRate: 6 },
    { slug: "luxe-lane", gmv: 2_090_100, orders: 311, commissionRate: 12 },
    { slug: "kartiva-essentials", gmv: 1_870_400, orders: 655, commissionRate: 0 },
  ],
};

export const SELLER_APPLICATIONS = [
  { id: 101, business: "Saree Sutra Handlooms", owner: "Meenakshi Sundaram", city: "Kanchipuram, Tamil Nadu", gstin: "33ABCFS1234K1Z5", category: "Fashion", submittedAt: "2026-11-10T10:20:00Z", status: "pending" },
  { id: 102, business: "Kerala Ayur Naturals", owner: "Joseph Thomas", city: "Thrissur, Kerala", gstin: "32AAQPK7781L1Z2", category: "Beauty", submittedAt: "2026-11-09T15:45:00Z", status: "pending" },
  { id: 103, business: "Pixel Point Electronics", owner: "Harpreet Singh", city: "Ludhiana, Punjab", gstin: "03AAJFP4410M1Z9", category: "Electronics", submittedAt: "2026-11-09T09:05:00Z", status: "pending" },
  { id: 104, business: "Bamboo Basket Co.", owner: "Lalremsiami", city: "Aizawl, Mizoram", gstin: "15AAKFB2201C1Z1", category: "Home & Kitchen", submittedAt: "2026-11-02T12:00:00Z", status: "approved" },
];
