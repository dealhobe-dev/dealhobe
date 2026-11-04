import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IVariantOption {
  name: string;
  values: string[];
}

export interface IVariant {
  key: string; // option values joined by '|', e.g. "Red|M"
  options: { name: string; value: string }[];
  price: number;
  salePrice?: number; // never stored: set at read time by an active Offer (lib/offers.ts)
  costPrice?: number; // admin-only; never selected by default
  sku?: string;
  quantity: number;
  useMainImage: boolean;
  image?: string;
  imagePublicId?: string;
}

export interface IProduct extends Document {
  hasVariants: boolean;
  variantOptions: IVariantOption[];
  variants: IVariant[];
  sku: string;
  name: string;
  slug: string;
  price: number;
  salePrice?: number; // never stored: set at read time by an active Offer (lib/offers.ts)
  costPrice?: number; // admin-only; never selected by default
  quantity: number;
  shortDescription: string;
  brand?: string;
  category: string;
  subCategory?: string;
  description: string;
  images: string[];
  imagePublicIds: string[];
  isFeatured: boolean;
  isTrending: boolean;
  isNewArrival: boolean;
  isTopSeller: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VariantOptionSchema = new Schema(
  { name: { type: String, required: true }, values: [{ type: String }] },
  { _id: false }
);

const VariantSchema = new Schema(
  {
    key: { type: String, required: true },
    options: [{ name: String, value: String, _id: false }],
    price: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, min: 0, select: false }, // admin-only, like product.costPrice
    sku: { type: String },
    quantity: { type: Number, default: 0, min: 0 },
    useMainImage: { type: Boolean, default: true },
    image: { type: String },
    imagePublicId: { type: String },
  },
  { _id: false }
);

const ProductSchema = new Schema<IProduct>(
  {
    hasVariants: { type: Boolean, default: false },
    variantOptions: { type: [VariantOptionSchema], default: [] },
    variants: { type: [VariantSchema], default: [] },
    sku: { type: String, unique: true, sparse: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    // No salePrice: discounts come only from Offers. Leaving it out of the schema also drops it from saves.
    price: { type: Number, required: true },
    // Admin-only purchase cost. select:false keeps it out of every query (storefront,
    // search, orders) unless a route explicitly asks for it with .select('+costPrice').
    costPrice: { type: Number, min: 0, select: false },
    quantity: { type: Number, required: true, default: 0 },
    shortDescription: { type: String, required: true },
    brand: { type: String }, // Store name or ID — optional
    category: { type: String, required: true }, // Store name or ID
    subCategory: { type: String }, // Store name or ID — optional, scoped under category
    description: { type: String, required: true }, // HTML
    images: [{ type: String }],
    imagePublicIds: [{ type: String }],
    isFeatured: { type: Boolean, default: false },
    isTrending: { type: Boolean, default: false },
    isNewArrival: { type: Boolean, default: false },
    isTopSeller: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Search-supporting indexes: category/subCategory/brand are queried via
// $in id-lists resolved from taxonomy name matches (see /api/products/search).
ProductSchema.index({ category: 1 });
ProductSchema.index({ subCategory: 1 });
ProductSchema.index({ brand: 1 });

const Product: Model<IProduct> =
  mongoose.models.Product || mongoose.model<IProduct>('Product', ProductSchema);

export default Product;
