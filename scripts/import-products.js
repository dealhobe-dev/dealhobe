#!/usr/bin/env node
/*
 * Bulk product importer.
 *
 *   node scripts/import-products.js <data.json> --brand FENNEL            dry run (no writes)
 *   node scripts/import-products.js <data.json> --brand FENNEL --commit   upload images + insert
 *
 * <data.json> is an array of products scraped from the web:
 *   { name, category, subCategory, shortDescription, description (HTML),
 *     images: [sourceUrl], optionName?, variants?: [{ name, image: sourceUrl }], sourceUrl }
 *
 * Builds the same document shape the admin product form saves: DH-xxxxxxxx SKUs with
 * -1..-n variant SKUs, name-1234567 slugs, product price/stock mirroring the variants.
 * Category/sub-category are matched by name; a missing sub-category is created under
 * its category. Products whose name already exists for the brand are skipped, so
 * re-running after a partial failure only adds what is missing.
 * Images are downloaded from the source and uploaded to Cloudinary at full size,
 * once per distinct file.
 */

const { loadEnv } = require('./_env');
loadEnv();

const fs = require('fs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Placeholder pricing/stock until real numbers are entered in the admin panel.
const PRICE = 635;
const COST_PRICE = 500;
const STOCK = 100;
const TAGS = ['isTrending', 'isNewArrival', 'isFeatured', 'isTopSeller'];

const args = process.argv.slice(2);
const dataFile = args.find((a) => !a.startsWith('--'));
const brandName = args[args.indexOf('--brand') + 1];
const commit = args.includes('--commit');
if (!dataFile || !args.includes('--brand') || !brandName) {
  console.error('Usage: node scripts/import-products.js <data.json> --brand <name> [--commit]');
  process.exit(1);
}

const randomDigits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const slugify = (name) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sameName = (name) => new RegExp(`^${escapeRegex(name.trim())}$`, 'i');

/** A random non-empty subset of the homepage tags. */
function randomTags() {
  const picked = TAGS.filter(() => Math.random() < 0.4);
  if (!picked.length) picked.push(TAGS[Math.floor(Math.random() * TAGS.length)]);
  return Object.fromEntries(TAGS.map((t) => [t, picked.includes(t)]));
}

const uploads = new Map(); // sha1 of file -> { url, publicId }

async function upload(sourceUrl) {
  const origin = new URL(sourceUrl).origin;
  const res = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130', Referer: `${origin}/` },
  });
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${sourceUrl}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = crypto.createHash('sha1').update(buf).digest('hex');
  if (uploads.has(hash)) return uploads.get(hash);
  const mime = res.headers.get('content-type') || 'image/png';
  let result;
  for (let attempt = 1; ; attempt++) {
    try {
      result = await cloudinary.uploader.upload(`data:${mime};base64,${buf.toString('base64')}`, {
        folder: 'dealhobe/products',
        resource_type: 'image',
        timeout: 180000,
      });
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
      console.warn(`  upload attempt ${attempt} failed (${err?.error?.message || err.message}), retrying…`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  const out = { url: result.secure_url, publicId: result.public_id, width: result.width, height: result.height };
  uploads.set(hash, out);
  return out;
}

(async () => {
  const items = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  await mongoose.connect(process.env.MONGODB_URI, { family: 4, serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  console.log(`Connected to "${mongoose.connection.name}" — ${commit ? 'COMMIT' : 'DRY RUN'}, ${items.length} products\n`);

  const brand = await db.collection('brands').findOne({ name: sameName(brandName) });
  if (!brand) throw new Error(`Brand "${brandName}" not found`);
  const categories = await db.collection('categories').find().toArray();
  const subCategories = await db.collection('subcategories').find().toArray();

  // Resolve every category / sub-category up front so a typo fails before anything is written.
  const plan = [];
  const toCreate = new Map(); // "catId|name" -> { category, name }
  for (const item of items) {
    const cat = categories.find((c) => c.name.toLowerCase() === item.category.toLowerCase());
    if (!cat) throw new Error(`Category "${item.category}" not found (product "${item.name}")`);
    const sub = subCategories.find(
      (s) => s.category === String(cat._id) && s.name.toLowerCase() === item.subCategory.toLowerCase(),
    );
    if (!sub) toCreate.set(`${cat._id}|${item.subCategory}`, { category: String(cat._id), name: item.subCategory, catName: cat.name });
    plan.push({ item, cat, sub });
  }
  for (const s of toCreate.values()) console.log(`+ sub-category "${s.name}" under ${s.catName}${commit ? '' : ' (would create)'}`);

  if (commit) {
    for (const [key, s] of toCreate) {
      const maxOrder = subCategories
        .filter((x) => x.category === s.category)
        .reduce((m, x) => Math.max(m, x.order || 0), 0);
      const now = new Date();
      const doc = { name: s.name, category: s.category, order: maxOrder + 1, createdAt: now, updatedAt: now, __v: 0 };
      const { insertedId } = await db.collection('subcategories').insertOne(doc);
      subCategories.push({ ...doc, _id: insertedId });
      toCreate.set(key, { ...s, _id: insertedId });
    }
  }

  const products = db.collection('products');
  const report = [];
  for (const { item, cat, sub } of plan) {
    const subId = sub ? String(sub._id) : commit ? String(toCreate.get(`${cat._id}|${item.subCategory}`)._id) : '(new)';
    const existing = await products.findOne({ brand: String(brand._id), name: sameName(item.name) }, { projection: { slug: 1, sku: 1 } });
    if (existing) {
      console.log(`= skip "${item.name}" (already exists: ${existing.sku})`);
      report.push({ name: item.name, status: 'skipped', sku: existing.sku, slug: existing.slug });
      continue;
    }

    let sku;
    do sku = `DH-${randomDigits(8)}`;
    while (await products.findOne({ $or: [{ sku }, { 'variants.sku': new RegExp(`^${sku}-`) }] }));
    let slug;
    do slug = `${slugify(item.name)}-${randomDigits(7)}`;
    while (await products.findOne({ slug }));

    const variants = item.variants || [];
    const hasVariants = variants.length > 0;
    const tags = randomTags();

    if (!commit) {
      console.log(`· ${item.name} → ${item.category} › ${item.subCategory} | ${item.images.length} images, ${variants.length} variants | ${sku}`);
      report.push({ name: item.name, status: 'dry-run', sku, slug });
      continue;
    }

    const images = [];
    for (const src of item.images) images.push(await upload(src));
    const builtVariants = [];
    for (const [i, v] of variants.entries()) {
      const img = await upload(v.image);
      builtVariants.push({
        key: v.name,
        options: [{ name: item.optionName, value: v.name }],
        price: PRICE,
        costPrice: COST_PRICE,
        sku: `${sku}-${i + 1}`,
        quantity: STOCK,
        useMainImage: false,
        image: img.url,
        imagePublicId: img.publicId,
      });
    }

    const now = new Date();
    const doc = {
      hasVariants,
      variantOptions: hasVariants ? [{ name: item.optionName, values: variants.map((v) => v.name) }] : [],
      variants: builtVariants,
      sku,
      name: item.name,
      slug,
      price: PRICE,
      costPrice: COST_PRICE,
      quantity: hasVariants ? STOCK * variants.length : STOCK,
      shortDescription: item.shortDescription,
      brand: String(brand._id),
      category: String(cat._id),
      subCategory: subId,
      description: item.description,
      images: images.map((i) => i.url),
      imagePublicIds: images.map((i) => i.publicId),
      ...tags,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    };
    const { insertedId } = await products.insertOne(doc);
    const tagList = TAGS.filter((t) => tags[t]).join(', ');
    console.log(`✓ ${item.name} — ${sku}, ${images.length} images, ${variants.length} variants [${tagList}]`);
    report.push({
      id: String(insertedId), name: item.name, status: 'created', sku, slug,
      category: `${cat.name} › ${item.subCategory}`, images: images.length,
      imageSizes: images.map((i) => `${i.width}x${i.height}`), variants: variants.length,
      option: item.optionName || null, tags: tagList, source: item.sourceUrl,
    });
  }

  const reportFile = dataFile.replace(/\.json$/, `.${commit ? 'result' : 'dryrun'}.json`);
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 1));
  console.log(`\n${report.filter((r) => r.status === 'created').length} created, ${report.filter((r) => r.status === 'skipped').length} skipped, ${uploads.size} images uploaded. Report: ${reportFile}`);
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error('\nImport failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
