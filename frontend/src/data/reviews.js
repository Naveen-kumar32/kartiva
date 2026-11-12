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
  return Array.from({ length: count }, (_, i) => {
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
