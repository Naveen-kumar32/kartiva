// Sample sellers for the demo. All businesses, GSTINs and addresses are fictional.
const std = (id, fee, freeAbove, min, max, cod = true) => ({
  id, name: "Standard Delivery", type: "standard", fee, freeAbove, minDays: min, maxDays: max, codAllowed: cod,
});
const exp = (id, fee, min, max) => ({
  id, name: "Express Delivery", type: "express", fee, freeAbove: null, minDays: min, maxDays: max, codAllowed: false,
});

export const STORES = [
  {
    slug: "kartiva-essentials", name: "Kartiva Essentials", initials: "KE", color: "#0e7c7b",
    banner: "linear-gradient(120deg,#0b3f3f,#0e7c7b 55%,#14a397)", city: "Chennai", state: "Tamil Nadu",
    gstStateCode: "33", gstin: "33AAJCK4821N1ZQ", rating: 4.6, ratingCount: 3120, since: 2026, isFeatured: true,
    isPlatformOwned: true, tagline: "Everyday essentials, curated by Kartiva.",
    returnPolicy: "7-day easy returns on unused items in original packaging.",
    shippingMethods: [std(1, 49, 499, 3, 5), exp(2, 99, 1, 2)],
  },
  {
    slug: "technest", name: "TechNest India", initials: "TN", color: "#2563eb",
    banner: "linear-gradient(120deg,#0f172a,#1e3a8a 60%,#2563eb)", city: "Bengaluru", state: "Karnataka",
    gstStateCode: "29", gstin: "29AAFCT7731B1Z2", rating: 4.5, ratingCount: 8420, since: 2026, isFeatured: true,
    tagline: "Genuine phones & laptops with GST invoice.",
    returnPolicy: "7-day replacement for manufacturing defects. Seal must be intact for change-of-mind returns.",
    shippingMethods: [std(3, 0, null, 2, 4), exp(4, 149, 1, 1)],
  },
  {
    slug: "gadget-galaxy", name: "Gadget Galaxy", initials: "GG", color: "#7c3aed",
    banner: "linear-gradient(120deg,#2e1065,#6d28d9 60%,#a78bfa)", city: "Chennai", state: "Tamil Nadu",
    gstStateCode: "33", gstin: "33AAKFG2210Q1Z9", rating: 4.3, ratingCount: 2210, since: 2026,
    tagline: "Accessories that keep you charged.",
    returnPolicy: "7-day returns. Opened earphones are replacement-only.",
    shippingMethods: [std(5, 40, 399, 3, 6)],
  },
  {
    slug: "urbanthread", name: "UrbanThread Co.", initials: "UT", color: "#db2777",
    banner: "linear-gradient(120deg,#500724,#be185d 60%,#f472b6)", city: "Mumbai", state: "Maharashtra",
    gstStateCode: "27", gstin: "27AAGCU5512H1Z4", rating: 4.4, ratingCount: 5630, since: 2026, isFeatured: true,
    tagline: "Everyday fashion, made in India.",
    returnPolicy: "7-day returns and size exchanges. Tags must be attached.",
    shippingMethods: [std(6, 49, 599, 3, 6), exp(7, 119, 1, 2)],
  },
  {
    slug: "luxe-lane", name: "Luxe Lane", initials: "LL", color: "#b45309",
    banner: "linear-gradient(120deg,#451a03,#92400e 60%,#d97706)", city: "New Delhi", state: "Delhi",
    gstStateCode: "07", gstin: "07AAHFL9087K1Z1", rating: 4.5, ratingCount: 1980, since: 2026,
    tagline: "Watches, bags and accessories that stand out.",
    returnPolicy: "7-day returns. Jewellery is non-returnable once worn.",
    shippingMethods: [std(8, 0, null, 3, 5), exp(9, 129, 1, 2)],
  },
  {
    slug: "homecraft", name: "HomeCraft Living", initials: "HC", color: "#15803d",
    banner: "linear-gradient(120deg,#052e16,#166534 60%,#22c55e)", city: "Jaipur", state: "Rajasthan",
    gstStateCode: "08", gstin: "08AAICH3345D1Z7", rating: 4.2, ratingCount: 1420, since: 2026, isFeatured: true,
    tagline: "Handpicked home & kitchen from Rajasthan.",
    returnPolicy: "7-day returns for damaged or defective items. Furniture assembled items are non-returnable.",
    shippingMethods: [
      std(10, 79, 999, 5, 8),
      { id: 11, name: "Store Pickup (Jaipur)", type: "store_pickup", fee: 0, freeAbove: null, minDays: 0, maxDays: 1, codAllowed: true },
    ],
  },
  {
    slug: "spice-route", name: "Spice Route Grocers", initials: "SR", color: "#ea580c",
    banner: "linear-gradient(120deg,#431407,#c2410c 60%,#fb923c)", city: "Kochi", state: "Kerala",
    gstStateCode: "32", gstin: "32AAQFS6670M1Z3", rating: 4.7, ratingCount: 6750, since: 2026, isFeatured: true,
    tagline: "Fresh produce & Kerala spices, delivered fast.",
    returnPolicy: "Perishables are non-returnable. Damaged items are refunded on the spot.",
    shippingMethods: [
      { id: 12, name: "Same-day Local Delivery (Kochi)", type: "local_delivery", fee: 29, freeAbove: 299, minDays: 0, maxDays: 0, codAllowed: true, pincodes: ["682", "683"] },
      std(13, 59, 499, 2, 5),
    ],
  },
  {
    slug: "glowup", name: "GlowUp Beauty", initials: "GB", color: "#c026d3",
    banner: "linear-gradient(120deg,#4a044e,#a21caf 60%,#e879f9)", city: "Hyderabad", state: "Telangana",
    gstStateCode: "36", gstin: "36AAMFG1209P1Z6", rating: 4.4, ratingCount: 2890, since: 2026,
    tagline: "100% authentic beauty & fragrances.",
    returnPolicy: "Returns only for sealed products within 7 days.",
    shippingMethods: [std(14, 49, 499, 3, 6)],
  },
  {
    slug: "fitzone", name: "FitZone Sports", initials: "FZ", color: "#0284c7",
    banner: "linear-gradient(120deg,#082f49,#0369a1 60%,#38bdf8)", city: "Pune", state: "Maharashtra",
    gstStateCode: "27", gstin: "27AAPCF4456E1Z8", rating: 4.3, ratingCount: 1310, since: 2026,
    tagline: "Gear up for every game.",
    returnPolicy: "7-day returns on unused equipment.",
    shippingMethods: [std(15, 59, 699, 4, 7), exp(16, 129, 2, 3)],
  },
  {
    slug: "annapoorna-wholesale", name: "Annapoorna Wholesale Mart", initials: "AW", color: "#a16207",
    banner: "linear-gradient(120deg,#422006,#a16207 60%,#facc15)", city: "Madurai", state: "Tamil Nadu",
    gstStateCode: "33", gstin: "33AAOFA5521R1Z6", rating: 4.5, ratingCount: 980, since: 2026,
    tagline: "Rice, pulses, oils & spices at wholesale prices — bulk slabs from 10 units.",
    returnPolicy: "Sealed, non-perishable packs returnable within 3 days. Bulk orders: damage claims within 48 hours.",
    shippingMethods: [std(17, 99, 2999, 3, 6), { id: 18, name: "Bulk Freight (Truck)", type: "standard", fee: 499, freeAbove: 25000, minDays: 4, maxDays: 8, codAllowed: false }],
  },
  {
    slug: "chefpro", name: "ChefPro Kitchen Equipment", initials: "CP", color: "#475569",
    banner: "linear-gradient(120deg,#0f172a,#334155 60%,#94a3b8)", city: "Coimbatore", state: "Tamil Nadu",
    gstStateCode: "33", gstin: "33AAKCC7710F1Z2", rating: 4.6, ratingCount: 640, since: 2026,
    tagline: "Commercial & home kitchen equipment, direct from the manufacturer.",
    returnPolicy: "10-day replacement for manufacturing defects. Installation support in Tamil Nadu & Kerala.",
    shippingMethods: [std(19, 0, null, 4, 7), exp(20, 199, 2, 3)],
  },
  {
    slug: "jalandhar-sports", name: "Jalandhar Sports Works", initials: "JS", color: "#15803d",
    banner: "linear-gradient(120deg,#052e16,#15803d 60%,#4ade80)", city: "Jalandhar", state: "Punjab",
    gstStateCode: "03", gstin: "03AAEFJ3392L1Z8", rating: 4.4, ratingCount: 720, since: 2026,
    tagline: "Sports goods manufacturer & exporter since 1987. Team and academy orders welcome.",
    returnPolicy: "7-day returns on unused goods. Custom-branded team orders are non-returnable.",
    shippingMethods: [std(21, 69, 999, 4, 8), exp(22, 149, 2, 3)],
  },
  {
    slug: "velocity-motors", name: "Velocity Motors", initials: "VM", color: "#dc2626",
    banner: "linear-gradient(120deg,#450a0a,#b91c1c 60%,#f87171)", city: "Pune", state: "Maharashtra",
    gstStateCode: "27", gstin: "27AAJFV8841D1Z5", rating: 4.3, ratingCount: 310, since: 2026,
    tagline: "Authorised two-wheeler dealer. Get the best on-road price & book a test ride.",
    returnPolicy: "Vehicle sales are final after registration. Booking amount refundable within 7 days.",
    shippingMethods: [{ id: 23, name: "Showroom Delivery (Pune)", type: "store_pickup", fee: 0, freeAbove: null, minDays: 2, maxDays: 7, codAllowed: false }],
  },
];

// Business profile shown on store pages and in admin (Alibaba / IndiaMART style). SAMPLE values.
const PROFILES = {
  "kartiva-essentials": { businessType: "Brand", yearEstablished: 2026, employees: "11–50", annualTurnover: "₹1–5 Cr", plan: "platinum", responseRate: 98, responseHours: 1, certifications: ["ISO 9001:2015"], mainMarkets: ["All India"], contactPerson: "Kartiva Retail Team", phone: "+91 44 4000 1234", ownerEmail: "admin@kartiva.demo" },
  technest: { businessType: "Authorised Retailer", yearEstablished: 2014, employees: "51–100", annualTurnover: "₹25–50 Cr", plan: "platinum", responseRate: 96, responseHours: 2, certifications: ["Apple Authorised Reseller", "Samsung Partner"], mainMarkets: ["South India", "West India"], contactPerson: "Arjun Mehta", phone: "+91 80 4110 2200", ownerEmail: "seller@kartiva.demo" },
  "gadget-galaxy": { businessType: "Distributor", yearEstablished: 2017, employees: "11–50", annualTurnover: "₹5–10 Cr", plan: "gold", responseRate: 91, responseHours: 4, certifications: ["BIS Registered"], mainMarkets: ["Tamil Nadu", "Karnataka"], contactPerson: "Suresh Babu", phone: "+91 44 4220 7788" , ownerEmail: "gadgets@kartiva.demo" },
  urbanthread: { businessType: "Manufacturer", yearEstablished: 2011, employees: "101–500", annualTurnover: "₹10–25 Cr", plan: "gold", responseRate: 94, responseHours: 3, certifications: ["OEKO-TEX Standard 100", "SEDEX Member"], mainMarkets: ["All India", "UAE", "UK"], contactPerson: "Zoya Kapoor", phone: "+91 22 4990 1122" , ownerEmail: "urbanthread@kartiva.demo" },
  "luxe-lane": { businessType: "Retailer", yearEstablished: 2016, employees: "11–50", annualTurnover: "₹5–10 Cr", plan: "gold", responseRate: 89, responseHours: 5, certifications: ["BIS Hallmark (jewellery)"], mainMarkets: ["North India"], contactPerson: "Rhea Malhotra", phone: "+91 11 4567 3300" , ownerEmail: "luxelane@kartiva.demo" },
  homecraft: { businessType: "Manufacturer & Exporter", yearEstablished: 2009, employees: "51–100", annualTurnover: "₹5–10 Cr", plan: "free", responseRate: 86, responseHours: 8, certifications: ["Handicrafts Export Council"], mainMarkets: ["All India", "USA", "Germany"], contactPerson: "Govind Sharma", phone: "+91 141 400 8899" , ownerEmail: "homecraft@kartiva.demo" },
  "spice-route": { businessType: "Retailer", yearEstablished: 2015, employees: "11–50", annualTurnover: "₹1–5 Cr", plan: "gold", responseRate: 97, responseHours: 1, certifications: ["FSSAI Licensed", "Spices Board Registered"], mainMarkets: ["Kerala"], contactPerson: "Anil Varghese", phone: "+91 484 400 2211" , ownerEmail: "spiceroute@kartiva.demo" },
  glowup: { businessType: "Authorised Retailer", yearEstablished: 2019, employees: "11–50", annualTurnover: "₹1–5 Cr", plan: "free", responseRate: 88, responseHours: 6, certifications: ["CDSCO Cosmetic Import Licence"], mainMarkets: ["South India"], contactPerson: "Sana Mirza", phone: "+91 40 4433 9090" , ownerEmail: "glowup@kartiva.demo" },
  fitzone: { businessType: "Retailer", yearEstablished: 2018, employees: "1–10", annualTurnover: "Up to ₹1 Cr", plan: "free", responseRate: 82, responseHours: 10, certifications: [], mainMarkets: ["Maharashtra"], contactPerson: "Nikhil Deshpande", phone: "+91 20 4100 5566" , ownerEmail: "fitzone@kartiva.demo" },
  "annapoorna-wholesale": { businessType: "Wholesaler", yearEstablished: 1998, employees: "51–100", annualTurnover: "₹25–50 Cr", plan: "gold", responseRate: 95, responseHours: 2, certifications: ["FSSAI Licensed", "APEDA Registered"], mainMarkets: ["Tamil Nadu", "Kerala", "Karnataka"], contactPerson: "Senthil Kumar", phone: "+91 452 430 1188", ownerEmail: "wholesale@kartiva.demo" },
  chefpro: { businessType: "Manufacturer", yearEstablished: 2005, employees: "101–500", annualTurnover: "₹10–25 Cr", plan: "platinum", responseRate: 93, responseHours: 3, certifications: ["ISO 9001:2015", "NSF Certified (selected lines)", "BIS Registered"], mainMarkets: ["All India", "Sri Lanka", "UAE"], contactPerson: "Revathi Natarajan", phone: "+91 422 450 7700", ownerEmail: "chefpro@kartiva.demo" },
  "jalandhar-sports": { businessType: "Manufacturer & Exporter", yearEstablished: 1987, employees: "101–500", annualTurnover: "₹10–25 Cr", plan: "gold", responseRate: 90, responseHours: 4, certifications: ["ISO 9001:2015", "SGPC Export House"], mainMarkets: ["All India", "UK", "Australia", "South Africa"], contactPerson: "Gurpreet Singh", phone: "+91 181 460 3344", ownerEmail: "sports@kartiva.demo" },
  "velocity-motors": { businessType: "Authorised Dealer", yearEstablished: 2012, employees: "11–50", annualTurnover: "₹10–25 Cr", plan: "gold", responseRate: 99, responseHours: 1, certifications: ["Authorised Dealer Certificate", "RTO Trade Certificate"], mainMarkets: ["Pune", "Pimpri-Chinchwad"], contactPerson: "Aditya Kulkarni", phone: "+91 20 4700 9911", ownerEmail: "motors@kartiva.demo" },
};
const VERIFIED = { fitzone: "pending", glowup: "not_submitted" };
STORES.forEach((s) => Object.assign(s, {
  address: `${s.city}, ${s.state}`,
  badges: [...(s.rating >= 4.5 ? ["top_rated"] : []), ...(PROFILES[s.slug].plan !== "free" ? ["trusted"] : [])],
  gstVerified: true,
  kycStatus: VERIFIED[s.slug] ?? "verified",
  ...PROFILES[s.slug],
}));
