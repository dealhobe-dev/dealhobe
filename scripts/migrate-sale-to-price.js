#!/usr/bin/env node
/*
 * One-off: retire the stored sale price. Discounts now come only from Offers.
 *
 *   node scripts/migrate-sale-to-price.js           dry run: report what would change
 *   node scripts/migrate-sale-to-price.js --apply   back up, then write the changes
 *
 * For every product and every variant: when salePrice is a positive number it becomes the
 * price, and salePrice is removed. --apply first writes the untouched documents to
 * scripts/_sale-price-backup-<timestamp>.json.
 */

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./_env');
loadEnv();

const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

const hasSale = (x) => typeof x.salePrice === 'number' && x.salePrice > 0;

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { family: 4, serverSelectionTimeoutMS: 15000 });
  const products = mongoose.connection.db.collection('products');
  console.log(`Connected to "${mongoose.connection.name}"${APPLY ? '' : ' (dry run)'}`);

  const docs = await products
    .find({ $or: [{ salePrice: { $exists: true } }, { 'variants.salePrice': { $exists: true } }] })
    .toArray();

  const ops = [];
  let productPrices = 0;
  let variantPrices = 0;
  let higherThanPrice = 0;
  for (const p of docs) {
    const $set = {};
    if (hasSale(p)) {
      if (p.salePrice > p.price) higherThanPrice++;
      $set.price = p.salePrice;
      productPrices++;
    }
    if (Array.isArray(p.variants) && p.variants.some((v) => 'salePrice' in v)) {
      $set.variants = p.variants.map(({ salePrice, ...v }) => {
        if (!hasSale({ salePrice })) return v;
        if (salePrice > v.price) higherThanPrice++;
        variantPrices++;
        return { ...v, price: salePrice };
      });
    }
    const update = { $unset: { salePrice: '' } };
    if (Object.keys($set).length) update.$set = $set;
    ops.push({ updateOne: { filter: { _id: p._id }, update } });
    if (!APPLY && (hasSale(p) || $set.variants)) {
      const vs = (p.variants || []).filter(hasSale).map((v) => `${v.key}: ${v.price} -> ${v.salePrice}`);
      console.log(`  ${p.name}: ${hasSale(p) ? `${p.price} -> ${p.salePrice}` : 'price unchanged'}${vs.length ? ` | variants ${vs.join(', ')}` : ''}`);
    }
  }

  console.log(
    `${docs.length} products carry a salePrice; ${productPrices} product prices and ${variantPrices} variant prices change` +
      (higherThanPrice ? ` (${higherThanPrice} sale prices were HIGHER than the price)` : ''),
  );

  if (APPLY && ops.length) {
    const file = path.join(__dirname, `_sale-price-backup-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(docs, null, 2));
    console.log(`Backed up ${docs.length} products to ${path.relative(process.cwd(), file)}`);
    const res = await products.bulkWrite(ops);
    console.log(`Updated ${res.modifiedCount} products.`);
  }
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error('Failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
