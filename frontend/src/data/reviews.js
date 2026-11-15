// Deterministic sample reviews generated per product (demo only).
const NAMES = ["Priya R.", "Rahul S.", "Ananya G.", "Vikram N.", "Fatima K.", "Arun P.", "Sneha M.", "Imran A.", "Divya T.", "Karthik V.", "Neha J.", "Rohit B."];
const CITIES = ["Chennai", "Mumbai", "Bengaluru", "Delhi", "Hyderabad", "Pune", "Kochi", "Jaipur", "Kolkata", "Lucknow"];
const TEXTS = [
  [5, "Excellent quality", "Exactly as described. Packaging was solid and delivery was quicker than expected."],
  [5, "Value for money", "Great price compared to other sites, and the GST invoice came with the package."],
  [4, "Good product", "Works well. Took one extra day to arrive but the seller kept me updated."],
  [4, "Happy with the purchase", "Build quality is nice. Would buy from this seller again."],
  [3, "Decent", "It is okay for the price. Expected slightly better finishing."],
  [5, "Highly recommend", "Paid via COD and the delivery person was polite. Product is genuine."],
  [2, "Not as expected", "Colour was a little different from the photos. Returning it — the return request was easy."],
];

export function buildReviews(product, count = 6) {
  // Never more sample reviews than the product's seeded rating count (new products have none; customers' own reviews are extra).
  const seeded = (product.reviewCount || 0) - (product.customerReviewCount || 0);
  return Array.from({ length: Math.max(0, Math.min(count, seeded)) }, (_, i) => {
    const seed = (product.id * 7 + i * 13) % 97;
    const [rating, title, body] = TEXTS[seed % TEXTS.length];
    const day = 1 + ((product.id + i * 5) % 28);
    return {
      id: `${product.id}-${i}`,
      author: NAMES[seed % NAMES.length],
      body,
      city: CITIES[(seed + i) % CITIES.length],
      createdAt: `2026-10-${String(day).padStart(2, "0")}T12:00:00Z`,
      helpful: (seed * 3) % 40,
      rating,
      title,
      verified: true,
    };
  });
}

/** Star breakdown {5: n, …, 1: n} for a product that only has a seeded average (same as backend reviews.estimate_counts). */
export function estimateCounts(rating, count) {
  const out = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  if (!count) return out;
  const stars = [5, 4, 3, 2, 1];
  const weights = Object.fromEntries(stars.map((s) => [s, Math.max(0.02, 1 - Math.abs(s - (rating || 0)) / 2.5)]));
  const total = stars.reduce((t, s) => t + weights[s], 0);
  const raw = Object.fromEntries(stars.map((s) => [s, (weights[s] / total) * count]));
  stars.forEach((s) => { out[s] = Math.floor(raw[s]); });
  const left = count - stars.reduce((t, s) => t + out[s], 0);
  [...stars].sort((a, b) => (raw[b] - out[b]) - (raw[a] - out[a]) || b - a).slice(0, left).forEach((s) => { out[s] += 1; }); // largest remainder
  return out;
}

export const ratingCounts = (product) => product.ratingCounts ?? estimateCounts(product.rating, product.reviewCount);
