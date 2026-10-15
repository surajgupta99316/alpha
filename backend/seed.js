import LandingPage from "./models/LandingPage.js";
import Product from "./models/Product.js";

const products = [
  {
    name: "Alpha Bold",
    slug: "alpha-bold",
    category: "Eau de Parfum",
    description: "A confident, everyday signature scent.",
    price: 799,
    mrp: 1199,
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
    imageUrl:
      "https://images.unsplash.com/photo-1595425970377-c9703cf48b6d?auto=format&fit=crop&w=1000&q=80",
  },
];

export async function seedDatabase() {
  for (const product of products) {
    await Product.updateOne({ slug: product.slug }, { $setOnInsert: product }, { upsert: true });
  }

  const bold = await Product.findOne({ slug: "alpha-bold" });
  await LandingPage.updateOne(
    { slug: "alpha-bold" },
    {
      $setOnInsert: {
        product: bold._id,
        slug: "alpha-bold",
        headline: "Make your presence unforgettable.",
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

  console.log("Sample products and the editable Alpha Bold campaign are ready.");
}
