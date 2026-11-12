"""Generate Kartiva mock catalogue JS modules from a downloaded sample product JSON.
Usage: python3 -I gen_mock.py <products.json> <out_dir>
"""
import json
import random
import re
import sys

src, out_dir = sys.argv[1], sys.argv[2]
raw = json.load(open(src))["products"]
rng = random.Random(42)

# Alibaba-style category tree (+ India-specific roots). Each root: (slug, name, short nav label, show in top menu,
# default (HSN, GST%), leaves). Leaves: (slug, name, source category in the sample JSON or None).
# Roots without sample products still list in "All categories" — buyers there are guided to post a buy request.
CATEGORY_TREE = [
    ("electronics", "Consumer Electronics", "Electronics", True, ("8517", 18), [
        ("smartphones", "Smartphones", "smartphones"), ("laptops", "Laptops", "laptops"), ("tablets", "Tablets", "tablets"),
        ("mobile-accessories", "Mobile Accessories", "mobile-accessories"), ("audio-video", "Audio & Smart Speakers", None),
        ("cameras-accessories", "Cameras & Accessories", None),
    ]),
    ("fashion", "Apparel & Accessories", "Apparel", True, ("6205", 5), [
        ("mens-shirts", "Men's Shirts", "mens-shirts"), ("womens-dresses", "Women's Dresses", "womens-dresses"),
        ("womens-tops", "Women's Tops", "tops"), ("ethnic-wear", "Ethnic Wear (Sarees & Kurtas)", None), ("uniforms-workwear", "Uniforms & Workwear", None),
    ]),
    ("watches-accessories", "Jewellery, Eyewear & Watches", "Jewellery & Watches", True, ("9102", 18), [
        ("mens-watches", "Men's Watches", "mens-watches"), ("womens-watches", "Women's Watches", "womens-watches"),
        ("jewellery", "Jewellery", "womens-jewellery"), ("sunglasses", "Sunglasses & Eyewear", "sunglasses"),
    ]),
    ("home-kitchen", "Home & Garden", "Home & Garden", True, ("7323", 5), [
        ("kitchen", "Kitchen & Dining", "kitchen-accessories"), ("home-decor", "Home Décor", "home-decoration"),
        ("home-textiles", "Home Textiles & Bedding", None), ("garden-supplies", "Garden Supplies & Plants", None),
    ]),
    ("beauty", "Beauty", "Beauty", True, ("3304", 18), [
        ("makeup", "Makeup", "beauty"), ("fragrances", "Fragrances", "fragrances"), ("skin-care", "Skin Care", "skin-care"), ("hair-care", "Hair Care", None),
    ]),
    ("grocery", "Agriculture, Food & Beverage", "Food & Grocery", True, ("0713", 5), [
        ("fresh-pantry", "Grocery & Staples", "groceries"), ("beverages", "Tea, Coffee & Beverages", None),
        ("spices-dry-fruits", "Spices & Dry Fruits", None), ("agri-inputs", "Seeds, Fertilisers & Agri Inputs", None),
    ]),
    ("sports", "Sports & Entertainment", "Sports", True, ("9506", 5), [
        ("sports-equipment", "Sports Equipment", "sports-accessories"), ("fitness-gym", "Fitness & Gym Equipment", None),
        ("musical-instruments", "Musical Instruments", None), ("toys-games", "Toys & Games", None),
    ]),
    ("automotive", "Vehicles & Transportation", "Vehicles", True, ("8711", 18), [
        ("two-wheelers", "Two-Wheelers", "motorcycle"), ("electric-vehicles", "Electric Scooters & EVs", None), ("commercial-vehicles", "Commercial Vehicles", None),
    ]),
    ("packaging-printing", "Packaging & Printing", None, False, ("4819", 18), [
        ("corrugated-boxes", "Corrugated Boxes & Cartons", None), ("paper-bags", "Paper & Plastic Bags", None),
        ("labels-stickers", "Labels & Stickers", None), ("printing-services", "Printing Services", None),
    ]),
    ("sportswear-outdoor", "Sportswear & Outdoor Apparel", None, False, ("6112", 5), [
        ("sportswear", "Sportswear & Activewear", None), ("outdoor-gear", "Camping & Outdoor Gear", None),
    ]),
    ("shoes", "Shoes & Accessories", "Shoes", False, ("6403", 18), [
        ("mens-shoes", "Men's Footwear", "mens-shoes"), ("womens-shoes", "Women's Footwear", "womens-shoes"), ("kids-shoes", "Kids' Footwear", None),
    ]),
    ("luggage-bags", "Luggage, Bags & Cases", "Bags", False, ("4202", 18), [
        ("handbags", "Handbags", "womens-bags"), ("backpacks", "Backpacks & School Bags", None), ("travel-luggage", "Travel Luggage", None),
    ]),
    ("kids-toys", "Parents, Kids & Toys", None, False, ("9503", 12), [
        ("baby-care", "Baby Care", None), ("kids-clothing", "Kids' Clothing", None), ("educational-toys", "Educational Toys", None),
    ]),
    ("personal-home-care", "Personal Care & Home Care", None, False, ("3401", 18), [
        ("personal-hygiene", "Personal Hygiene", None), ("home-care", "Home Care & Cleaning", None), ("laundry", "Laundry Supplies", None),
    ]),
    ("health-medical", "Health & Medical", None, False, ("9018", 12), [
        ("medical-devices", "Medical Devices", None), ("first-aid", "First Aid & PPE", None), ("health-supplements", "Health Supplements", None),
    ]),
    ("gifts-crafts", "Gifts & Crafts", None, False, ("9505", 12), [
        ("corporate-gifts", "Corporate Gifts", None), ("festive-decor", "Festive Décor & Diyas", None), ("art-craft-supplies", "Art & Craft Supplies", None),
    ]),
    ("pet-supplies", "Pet Supplies", None, False, ("2309", 18), [
        ("pet-food", "Pet Food", None), ("pet-accessories", "Pet Accessories", None),
    ]),
    ("school-office", "School & Office Supplies", None, False, ("4820", 12), [
        ("stationery", "Stationery", None), ("office-supplies", "Office Supplies", None), ("books", "Books & Publications", None),
    ]),
    ("furniture-store", "Furniture", "Furniture", False, ("9403", 18), [
        ("furniture", "Home Furniture", "furniture"), ("office-furniture", "Office Furniture", None), ("outdoor-furniture", "Outdoor Furniture", None),
    ]),
    ("lights-lighting", "Lights & Lighting", None, False, ("9405", 18), [
        ("led-lights", "LED Lights & Bulbs", None), ("decorative-lighting", "Decorative Lighting & Lamps", None), ("solar-lights", "Solar Lights", None),
    ]),
    ("home-appliances", "Home Appliances", "Appliances", False, ("8509", 18), [
        ("kitchen-appliances", "Kitchen Appliances", None), ("large-appliances", "Refrigerators & Washing Machines", None), ("fans-coolers", "Fans & Air Coolers", None),
    ]),
    ("industrial-machinery", "Industrial Machinery", None, False, ("8479", 18), [
        ("food-processing-machines", "Food Processing Machines", None), ("packaging-machines", "Packaging Machines", None), ("textile-machinery", "Textile Machinery", None),
    ]),
    ("commercial-equipment", "Commercial Equipment & Machinery", None, False, ("8419", 18), [
        ("commercial-kitchen", "Commercial Kitchen Equipment", None), ("retail-display", "Retail Display & POS", None), ("vending-machines", "Vending Machines", None),
    ]),
    ("construction-machinery", "Construction & Building Machinery", None, False, ("8429", 18), [
        ("excavators-loaders", "Excavators & Loaders", None), ("concrete-machinery", "Concrete Mixers & Pumps", None), ("cranes-hoists", "Cranes & Hoists", None),
    ]),
    ("construction-real-estate", "Construction & Real Estate", None, False, ("6907", 18), [
        ("building-materials", "Cement, Bricks & Tiles", None), ("sanitaryware", "Sanitaryware & Bath Fittings", None), ("doors-windows", "Doors & Windows", None),
    ]),
    ("automotive-tools", "Automotive Supplies & Tools", None, False, ("8205", 18), [
        ("car-care", "Car Care & Cleaning", None), ("garage-tools", "Garage Equipment & Tools", None),
    ]),
    ("vehicle-parts", "Vehicle Parts & Accessories", None, False, ("8714", 28), [
        ("two-wheeler-parts", "Two-Wheeler Parts", None), ("car-accessories", "Car Accessories", None), ("tyres-tubes", "Tyres & Tubes", None),
    ]),
    ("tools-hardware", "Tools & Hardware", None, False, ("8205", 18), [
        ("hand-tools", "Hand Tools", None), ("power-tools", "Power Tools", None), ("fasteners", "Fasteners & Fittings", None),
    ]),
    ("renewable-energy", "Renewable Energy", None, False, ("8541", 12), [
        ("solar-panels", "Solar Panels", None), ("inverters-batteries", "Inverters & Batteries", None), ("solar-water-heaters", "Solar Water Heaters", None),
    ]),
    ("electrical-equipment", "Electrical Equipment & Supplies", None, False, ("8544", 18), [
        ("wires-cables", "Wires & Cables", None), ("switches-sockets", "Switches & Sockets", None), ("switchgear", "Switchgear & Panels", None),
    ]),
    ("safety-security", "Safety & Security", None, False, ("8525", 18), [
        ("cctv-surveillance", "CCTV & Surveillance", None), ("safety-gear", "Safety Gear & PPE", None), ("fire-safety", "Fire Safety Equipment", None),
    ]),
    ("material-handling", "Material Handling", None, False, ("8427", 18), [
        ("pallet-trucks", "Pallet Trucks & Forklifts", None), ("conveyors", "Conveyors", None), ("storage-racks", "Storage Racks & Shelving", None),
    ]),
    ("testing-instruments", "Testing Instrument & Equipment", None, False, ("9031", 18), [
        ("measuring-instruments", "Measuring Instruments", None), ("lab-equipment", "Laboratory Equipment", None),
    ]),
    ("power-transmission", "Power Transmission", None, False, ("8483", 18), [
        ("electric-motors", "Electric Motors", None), ("gearboxes", "Gearboxes", None), ("bearings", "Bearings", None),
    ]),
    ("electronic-components", "Electronic Components", None, False, ("8542", 18), [
        ("ics-semiconductors", "ICs & Semiconductors", None), ("pcb-modules", "PCBs & Modules", None), ("passive-components", "Resistors, Capacitors & Passives", None),
    ]),
    ("raw-materials", "Raw Materials", None, False, ("7208", 18), [
        ("steel-metals", "Steel & Metals", None), ("chemicals", "Industrial Chemicals", None), ("paper-pulp", "Paper & Pulp", None),
    ]),
    ("rubber-plastics", "Rubber & Plastics", None, False, ("3926", 18), [
        ("plastic-granules", "Plastic Granules & Raw Material", None), ("plastic-products", "Plastic Products", None), ("rubber-products", "Rubber Products", None),
    ]),
    ("textiles-fabrics", "Textiles & Fabrics", None, False, ("5208", 5), [
        ("cotton-fabrics", "Cotton Fabrics", None), ("silk-fabrics", "Silk Fabrics", None), ("yarn-threads", "Yarn & Threads", None),
    ]),
    ("ayurveda-herbal", "Ayurveda & Herbal Products", None, False, ("3004", 12), [
        ("ayurvedic-medicines", "Ayurvedic Medicines", None), ("herbal-cosmetics", "Herbal Cosmetics", None), ("essential-oils", "Essential Oils", None),
    ]),
    ("handicrafts-handloom", "Handicrafts & Handloom", None, False, ("4420", 12), [
        ("handloom-sarees", "Handloom Sarees & Stoles", None), ("brass-copper", "Brass & Copper Crafts", None), ("wooden-crafts", "Wooden Handicrafts", None),
    ]),
    ("fabrication-services", "Fabrication Services", None, False, ("9988", 18), [
        ("cnc-machining", "CNC Machining", None), ("sheet-metal", "Sheet Metal Fabrication", None), ("3d-printing", "3D Printing", None),
    ]),
    ("services", "Services", None, False, ("9985", 18), [
        ("logistics-services", "Logistics & Transport", None), ("installation-repair", "Installation & Repair", None),
        ("business-services", "Business & Consulting", None), ("event-services", "Event & Wedding Services", None),
    ]),
]

# Move some sample products into a more specific leaf (by title), and ChefPro's range into Commercial Kitchen.
LEAF_BY_TITLE = {
    "Cat Food": "pet-food", "Dog Food": "pet-food", "Boxed Blender": "kitchen-appliances", "Electric Stove": "kitchen-appliances",
    "Microwave Oven": "kitchen-appliances", "Protein Powder": "health-supplements", "Tissue Paper Box": "home-care",
    "Table Lamp": "decorative-lighting", "Nescafe Coffee": "beverages", "Juice": "beverages", "Soft Drinks": "beverages", "Water": "beverages",
    "Amazon Echo Plus": "audio-video", "Apple HomePod Mini Cosmic Grey": "audio-video", "Apple AirPods Max Silver": "audio-video",
    "Beats Flex Wireless Earphones": "audio-video", "Apple Airpods": "audio-video", "TV Studio Camera Pedestal": "cameras-accessories",
    "Monopod": "cameras-accessories", "Selfie Stick Monopod": "cameras-accessories",
}
LEAF_BY_STORE = {"chefpro": "commercial-kitchen"}

TAX = {  # sample HSN / GST values for the demo
    "smartphones": ("8517", 18), "laptops": ("8471", 18), "tablets": ("8471", 18),
    "mobile-accessories": ("8518", 18), "mens-shirts": ("6205", 5), "mens-shoes": ("6403", 18),
    "womens-dresses": ("6204", 5), "womens-tops": ("6206", 5), "womens-shoes": ("6403", 18),
    "handbags": ("4202", 18), "mens-watches": ("9102", 18), "womens-watches": ("9102", 18),
    "jewellery": ("7117", 5), "sunglasses": ("9004", 18), "kitchen": ("7323", 5),
    "furniture": ("9403", 18), "home-decor": ("6913", 5), "makeup": ("3304", 18),
    "fragrances": ("3303", 18), "skin-care": ("3304", 18), "fresh-pantry": ("0713", 5),
    "sports-equipment": ("9506", 5), "two-wheelers": ("8711", 18),
}

STORE_FOR = {
    "smartphones": ["technest", "gadget-galaxy"], "laptops": ["technest"], "tablets": ["technest"],
    "mobile-accessories": ["gadget-galaxy", "kartiva-essentials"], "mens-shirts": ["urbanthread"],
    "mens-shoes": ["urbanthread"], "womens-dresses": ["urbanthread"], "womens-tops": ["urbanthread"],
    "womens-shoes": ["luxe-lane"], "handbags": ["luxe-lane"], "mens-watches": ["luxe-lane"],
    "womens-watches": ["luxe-lane"], "jewellery": ["luxe-lane"], "sunglasses": ["luxe-lane"],
    "kitchen": ["homecraft", "kartiva-essentials", "chefpro"], "furniture": ["homecraft"],
    "home-decor": ["homecraft"], "makeup": ["glowup"], "fragrances": ["glowup"],
    "skin-care": ["glowup"], "fresh-pantry": ["spice-route", "annapoorna-wholesale"],
    "sports-equipment": ["fitzone", "jalandhar-sports"], "two-wheelers": ["velocity-motors"],
}

# B2B / wholesale behaviour per store (Alibaba / IndiaMART style). priceTiers are % off the variant price.
WHOLESALE = {
    "annapoorna-wholesale": [{"minQty": 10, "discountPct": 6}, {"minQty": 50, "discountPct": 12}],
    "chefpro": [{"minQty": 5, "discountPct": 5}, {"minQty": 20, "discountPct": 10}],
    "jalandhar-sports": [{"minQty": 10, "discountPct": 8}, {"minQty": 100, "discountPct": 15}],
}
ENQUIRY_ONLY = {"velocity-motors"}  # dealer listings: price shown, buyers send an enquiry / book a test ride

COLOURS = ["Midnight Black", "Ocean Blue", "Silver", "Forest Green", "Rose Gold", "Graphite"]

src_to_leaf = {}
categories = []
leaf_names = {}
cid = 1
for order, (root_slug, root_name, short, in_nav, root_tax, leaves) in enumerate(CATEGORY_TREE):
    root_id = cid
    root = {"id": cid, "slug": root_slug, "name": root_name, "parentId": None, "sortOrder": order, "showInNav": in_nav}
    if short:
        root["shortName"] = short
    categories.append(root)
    cid += 1
    for i, (slug, name, src_cat) in enumerate(leaves):
        hsn, rate = TAX.get(slug, root_tax)
        TAX[slug] = (hsn, rate)
        categories.append({"id": cid, "slug": slug, "name": name, "parentId": root_id, "sortOrder": i,
                           "defaultHsn": hsn, "defaultGstRate": rate})
        leaf_names[slug] = name
        if src_cat:
            src_to_leaf[src_cat] = slug
        cid += 1


def inr(usd):
    x = usd * 85
    if x < 1000:
        return int(x // 10 * 10 + 9)
    return int(x // 100 * 100 + 99)


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def variant_plan(leaf):
    if leaf in ("smartphones", "tablets"):
        cols = rng.sample(COLOURS, 2)
        return [{"name": "Storage", "values": ["128 GB", "256 GB"]}, {"name": "Colour", "values": cols}]
    if leaf == "laptops":
        return [{"name": "Configuration", "values": ["16 GB / 512 GB", "16 GB / 1 TB"]}]
    if leaf in ("mens-shirts", "womens-dresses", "womens-tops"):
        return [{"name": "Size", "values": ["S", "M", "L", "XL"]}]
    if leaf in ("mens-shoes", "womens-shoes"):
        return [{"name": "Size", "values": ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10"]}]
    if leaf == "two-wheelers":
        return [{"name": "Colour", "values": rng.sample(["Racing Red", "Matte Black", "Pearl White", "Metallic Blue"], 2)}]
    if leaf in ("handbags", "mens-watches", "womens-watches"):
        return [{"name": "Colour", "values": rng.sample(COLOURS, 2)}]
    return []


def combos(options):
    result = [{}]
    for opt in options:
        result = [dict(r, **{opt["name"]: v}) for r in result for v in opt["values"]]
    return result


products = []
vid = 1
counters = {}
for p in raw:
    leaf = src_to_leaf.get(p["category"])
    if not leaf or "beef" in p["title"].lower():  # not appropriate for an Indian marketplace demo
        continue
    stores = STORE_FOR[leaf]
    counters[leaf] = counters.get(leaf, 0) + 1
    store = stores[counters[leaf] % len(stores)]
    leaf = LEAF_BY_STORE.get(store) or LEAF_BY_TITLE.get(p["title"]) or leaf
    base = inr(p["price"])
    disc = max(5, min(60, round(p.get("discountPercentage", 10))))
    options = variant_plan(leaf)
    variants = []
    for i, attrs in enumerate(combos(options)):
        price = base
        if attrs.get("Storage") == "256 GB" or attrs.get("Configuration") == "16 GB / 1 TB":
            price = inr(p["price"] * 1.18)
        mrp = int(round(price / (1 - disc / 100), -1)) - 1 if price > 100 else price + 20
        roll = rng.random()
        stock = 0 if roll < 0.08 else (rng.randint(1, 3) if roll < 0.2 else rng.randint(8, 80))
        sku_base = "".join(w[0] for w in slugify(p["title"]).split("-")[:3]).upper()
        variants.append({
            "id": vid, "sku": f"{sku_base}-{p['id']:03d}-{i + 1}", "attributes": attrs,
            "price": price, "mrp": max(mrp, price), "stock": stock, "isDefault": i == 0,
        })
        vid += 1
    if store in ENQUIRY_ONLY:
        for v in variants:
            v["stock"] = rng.randint(2, 9)
    if all(v["stock"] == 0 for v in variants) and rng.random() < 0.7:
        variants[0]["stock"] = rng.randint(5, 30)
    hsn, rate = TAX[leaf]
    images = p.get("images") or [p["thumbnail"]]
    specs = [{"name": "Brand", "value": p.get("brand") or "Kartiva Select"}]
    specs += [{"name": "Category", "value": leaf_names[leaf]}]
    if p.get("tags"):
        specs.append({"name": "Highlights", "value": ", ".join(t.title() for t in p["tags"][:3])})
    specs.append({"name": "Country of Origin", "value": rng.choice(["India", "India", "China", "Vietnam"])})
    specs.append({"name": "HSN Code", "value": hsn})
    month = rng.randint(1, 10)
    day = rng.randint(1, 28)
    if store in ENQUIRY_ONLY:
        specs.insert(1, {"name": "Price type", "value": "Ex-showroom (on-road price on enquiry)"})
    product = {
        "id": p["id"], "slug": f"{slugify(p['title'])}-{p['id']}", "name": p["title"],
        "brand": p.get("brand") or "Kartiva Select", "categorySlug": leaf, "storeSlug": store,
        "description": p["description"], "thumbnail": p["thumbnail"], "images": images[:5],
        "rating": round(min(5.0, max(3.1, p.get("rating", 4.0))), 1),
        "reviewCount": rng.randint(12, 4800), "soldCount": rng.randint(20, 9000),
        "hsnCode": hsn, "gstRate": rate, "isReturnable": leaf not in ("fresh-pantry", "beverages"),
        "returnWindowDays": 0 if leaf in ("fresh-pantry", "beverages") else 7,
        "isFeatured": rng.random() < 0.12, "createdAt": f"2026-{month:02d}-{day:02d}T10:00:00Z",
        "specifications": specs, "variantOptions": options, "variants": variants,
    }
    if store in WHOLESALE:
        product["priceTiers"] = WHOLESALE[store]
        product["moq"] = 2 if store == "chefpro" and p["id"] % 3 == 0 else 1
    if store in ENQUIRY_ONLY:
        product["enquiryOnly"] = True
        product["isReturnable"] = False
        product["returnWindowDays"] = 0
    products.append(product)

header = "// AUTO-GENERATED sample data for the demo by frontend/scripts/generate-mock-data.py. Do not edit by hand.\n"
with open(f"{out_dir}/categories.js", "w") as f:
    f.write(header + "export const CATEGORIES = " + json.dumps(categories, indent=2, ensure_ascii=False) + ";\n")
with open(f"{out_dir}/products.js", "w") as f:
    f.write(header + "export const PRODUCTS = " + json.dumps(products, ensure_ascii=False) + ";\n")
print(len(categories), "categories,", len(products), "products,", vid - 1, "variants")
