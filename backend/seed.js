import LandingPage from "./models/LandingPage.js";
import Coupon from "./models/Coupon.js";
import Pincode from "./models/Pincode.js";
import Product from "./models/Product.js";
import bcrypt from "bcryptjs";
import StaffUser from "./models/StaffUser.js";

const products = [
  {
    name: "Alpha Bold",
    slug: "alpha-bold",
    category: "Eau de Parfum",
    description: "A confident, everyday signature scent.",
    price: 799,
    mrp: 1199,
    stock: 100,
    imageUrl:
      "https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=1000&q=80",
  },
  {
    name: "Alpha Boss",
    slug: "alpha-boss",
    category: "Eau de Parfum",
    description: "An expressive fragrance for after hours.",
    price: 899,
    mrp: 1299,
    stock: 100,
    imageUrl:
      "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?auto=format&fit=crop&w=1000&q=80",
  },
  {
    name: "Alpha Legend",
    slug: "alpha-legend",
    category: "Eau de Parfum",
    description: "A refined blend with a lasting impression.",
    price: 999,
    mrp: 1499,
    stock: 100,
    imageUrl:
      "https://images.unsplash.com/photo-1590736969955-71cc94901144?auto=format&fit=crop&w=1000&q=80",
  },
  {
    name: "Alpha Icon",
    slug: "alpha-icon",
    category: "Eau de Parfum",
    description: "A clean, modern scent for every day.",
    price: 749,
    mrp: 1099,
    stock: 100,
    imageUrl:
      "https://images.unsplash.com/photo-1595425970377-c9703cf48b6d?auto=format&fit=crop&w=1000&q=80",
  },
];

export async function seedDatabase() {
  await ensureInitialAdmin();
  for (const product of products) {
    await Product.updateOne({ slug: product.slug }, { $setOnInsert: product }, { upsert: true });
  }
  await Product.updateMany({ stock: { $exists: false } }, { $set: { stock: 100 } });

  const pincodes = [
    ["400001", "Mumbai", "Maharashtra", 2],
    ["400050", "Mumbai", "Maharashtra", 2],
    ["400051", "Mumbai", "Maharashtra", 2],
    ["110001", "New Delhi", "Delhi", 3],
    ["110019", "New Delhi", "Delhi", 3],
    ["560001", "Bengaluru", "Karnataka", 3],
    ["560034", "Bengaluru", "Karnataka", 3],
    ["600001", "Chennai", "Tamil Nadu", 4],
    ["500001", "Hyderabad", "Telangana", 4],
    ["700001", "Kolkata", "West Bengal", 5],
    ["411001", "Pune", "Maharashtra", 3],
    ["380001", "Ahmedabad", "Gujarat", 4],
  ];
  await Pincode.bulkWrite(
    pincodes.map(([code, city, state, deliveryDays]) => ({
      updateOne: {
        filter: { code },
        update: { $setOnInsert: { code, city, state, deliveryDays, serviceable: true } },
        upsert: true,
      },
    })),
    { ordered: true },
  );

  const couponExpiry = new Date();
  couponExpiry.setFullYear(couponExpiry.getFullYear() + 1);
  const seedCoupons = [
    {
      code: "WELCOME10",
      type: "percentage",
      value: 10,
      minimumOrderValue: 499,
      expiresAt: couponExpiry,
      usageLimit: 500,
      active: true,
    },
    {
      code: "ALPHA100",
      type: "flat",
      value: 100,
      minimumOrderValue: 999,
      expiresAt: couponExpiry,
      usageLimit: 250,
      active: true,
    },
  ];
  for (const coupon of seedCoupons) {
    await Coupon.updateOne({ code: coupon.code }, { $setOnInsert: coupon }, { upsert: true });
  }

  const bold = await Product.findOne({ slug: "alpha-bold" });
  await LandingPage.updateOne(
    { slug: "alpha-bold" },
    {
      $setOnInsert: {
        product: bold._id,
        slug: "alpha-bold",
        headline: "Make your presence unforgettable.",
        variantHeadline: "Leave a lasting impression, every day.",
        subheadline: "Meet Alpha Bold: your new signature, from the first hello to the last goodbye.",
        heroImage:
          "https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=1400&q=82",
        offerText: "Launch offer: Alpha Bold for ₹799. You save ₹400.",
        benefits: [
          "A fresh, confident opening",
          "Warm woods that stay close",
          "Made for everyday wear",
        ],
        ingredients: ["Bergamot", "Black pepper", "Cedarwood", "Musk"],
        faqs: [
          {
            question: "What does Alpha Bold smell like?",
            answer: "A fresh citrus opening with warm woods and a soft musk finish.",
          },
          {
            question: "How should I wear it?",
            answer: "Spray on pulse points from a short distance. Avoid contact with eyes.",
          },
        ],
        testimonials: [
          {
            name: "Sample customer",
            quote: "A sample review: a fresh scent that fits right into my daily routine.",
            isSample: true,
          },
          {
            name: "Sample customer",
            quote: "A sample review: clean, easy to wear, and nicely balanced.",
            isSample: true,
          },
        ],
        published: true,
      },
    },
    { upsert: true },
  );
  await LandingPage.updateOne(
    { slug: "alpha-bold", variantHeadline: { $exists: false } },
    { $set: { variantHeadline: "Leave a lasting impression, every day." } },
  );

  console.log("Sample products, serviceable pincodes, coupons, and the editable Alpha Bold campaign are ready.");
}

async function ensureInitialAdmin() {
  if (await StaffUser.exists({})) return;
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || "";
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
  if (!email && !password) {
    console.warn("No staff account exists. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD in .env to create the first admin.");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,200}$/.test(password)) {
    throw new Error("Set a valid BOOTSTRAP_ADMIN_EMAIL and a 12+ character BOOTSTRAP_ADMIN_PASSWORD with uppercase, lowercase, a number, and a symbol.");
  }
  await StaffUser.create({
    email,
    fullName: "Alpha Admin",
    passwordHash: await bcrypt.hash(password, 12),
    role: "admin",
  });
  console.log(`Created the initial staff admin account for ${email}.`);
}
