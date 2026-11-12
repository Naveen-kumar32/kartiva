import {
  Baby, Bike, Boxes, Building2, Car, ChefHat, Construction, Cog, Cpu, Dumbbell, Factory, Footprints, Forklift, Gauge,
  Gift, Hammer, Handshake, HeartPulse, House, LayoutGrid, Leaf, Lightbulb, Luggage, Mountain, Palette, PawPrint, PencilRuler, Plug,
  Printer, Refrigerator, Scissors, Shapes, Shirt, ShieldCheck, Smartphone, Sofa, Sparkles, SprayCan, Sun, Watch, Wheat, Wrench,
} from "lucide-react";

// Icon per top-level category (Alibaba-style category directory). Unknown / admin-created roots get LayoutGrid.
const ICONS = {
  "automotive": Bike, "automotive-tools": Wrench, "ayurveda-herbal": Leaf, "beauty": Sparkles, "commercial-equipment": ChefHat,
  "construction-machinery": Construction, "construction-real-estate": Building2, "electrical-equipment": Plug, "electronic-components": Cpu,
  "electronics": Smartphone, "fabrication-services": Factory, "fashion": Shirt, "furniture-store": Sofa, "gifts-crafts": Gift, "grocery": Wheat,
  "handicrafts-handloom": Palette, "health-medical": HeartPulse, "home-appliances": Refrigerator, "home-kitchen": House, "industrial-machinery": Cog,
  "kids-toys": Baby, "lights-lighting": Lightbulb, "luggage-bags": Luggage, "material-handling": Forklift, "packaging-printing": Printer,
  "personal-home-care": SprayCan, "pet-supplies": PawPrint, "power-transmission": Gauge, "raw-materials": Boxes, "renewable-energy": Sun,
  "rubber-plastics": Shapes, "safety-security": ShieldCheck, "school-office": PencilRuler, "services": Handshake, "shoes": Footprints,
  "sports": Dumbbell, "sportswear-outdoor": Mountain, "testing-instruments": Gauge, "textiles-fabrics": Scissors, "tools-hardware": Hammer,
  "vehicle-parts": Car, "watches-accessories": Watch,
};
export const categoryIcon = (slug) => ICONS[slug] ?? LayoutGrid;
