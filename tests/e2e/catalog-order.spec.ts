import { test, expect, adminLogin, phone } from './fixtures';
import { seed, cleanup } from './data';

test('Every catalog sort orders known products; price bands, ratings and stock filter results', async ({ page, audit, isMobile }) => {
  await adminLogin(page); const data = await seed(page); const products = [data.product]; const reviews: string[] = []; let orderNumber = '';
  try {
    expect((await page.request.put('/api/admin/products', { data: { id: data.product._id, price: 90, isFeatured: false } })).ok()).toBeTruthy();
    for (const [suffix, price, year, featured, quantity] of [
      ['B', 200, 2020, true, 100], ['C', 640, 2021, false, 100], ['D', 2500, 2022, false, 0],
    ] as const) {
      const res = await page.request.post('/api/admin/products', { data: {
        name: `${data.name} ${suffix}`, slug: `${data.product.slug}-${suffix.toLowerCase()}`, sku: `${data.product.sku}-${suffix}`,
        price, quantity, createdAt: `${year}-01-01T00:00:00Z`, isFeatured: featured,
        category: data.category._id, subCategory: data.sub._id, brand: data.brand._id,
        shortDescription: 'QA ordered product', description: '<p>QA sort data</p>', images: data.product.images,
      } }); expect(res.ok(), await res.text()).toBeTruthy(); products.push(await res.json());
    }
    for (const [index, rating] of [[0, 3], [1, 4], [2, 5], [3, 2]]) {
      const res = await page.request.post('/api/admin/reviews', { data: { productId: products[index]._id, customerId: data.name, customerName: 'QA Sort', customerEmail: 'e2e-sort@example.test', rating, review: `QA sort ${data.name} ${index}`, isApproved: true } });
      expect(res.ok(), await res.text()).toBeTruthy(); const review = await res.json(); reviews.push(review._id);
      expect((await page.request.put('/api/admin/reviews', { data: { id: review._id, isApproved: true } })).ok()).toBeTruthy();
    }
    const orderRes = await page.request.post('/api/orders', { data: { items: [{ productId: products[2]._id, qty: 3 }], delivery: { fullName: 'QA Sort', phone: phone(), address: 'QA Sort Street', area: 'inside_dhaka', paymentMethod: 'cash_on_delivery' } } });
    expect(orderRes.ok(), await orderRes.text()).toBeTruthy(); orderNumber = (await orderRes.json()).orderNumber;
    await page.goto(`/products?q=${encodeURIComponent(data.name)}`); await expect(page.locator('main article')).toHaveCount(4); await audit.check();
    const names = products.map(p => p.name);
    for (const [sort, indexes] of [
      ['price-asc', [0, 1, 2, 3]], ['price-desc', [3, 2, 1, 0]], ['newest', [0, 3, 2, 1]],
      ['best-selling', [2, 0, 1, 3]], ['top-rated', [2, 1, 0, 3]], ['featured', [1, 2, 0, 3]],
    ] as const) {
      await page.locator('select:visible').selectOption(sort);
      await expect(page.locator('main article h3')).toHaveText(indexes.map(i => names[i])); await audit.check();
    }
    const panel = isMobile ? page.getByRole('dialog', { name: 'Filters' }) : page.getByRole('complementary', { name: 'Filters' });
    for (const [label, count] of [['Under ৳500', 2], ['৳500 – ৳1,000', 1], ['৳1,000 – ৳2,000', 0], ['৳2,000+', 1]] as const) {
      if (isMobile) await page.getByRole('button', { name: /^Filter(?: \(\d+\))?$/ }).click();
      await panel.getByRole('button', { name: label, exact: true }).click();
      if (isMobile) await page.getByRole('button', { name: 'Close filters' }).click();
      await expect(page.locator('main article')).toHaveCount(count); await audit.check();
    }
    await page.getByRole('button', { name: 'Clear all', exact: true }).click();
    await page.goto(`/products?q=${encodeURIComponent(data.name)}`);
    if (isMobile) await page.getByRole('button', { name: /^Filter(?: \(\d+\))?$/ }).click();
    await panel.getByRole('button', { name: '★★★★☆ & up', exact: true }).click(); await panel.getByRole('button', { name: 'In stock only', exact: true }).click();
    if (isMobile) await page.getByRole('button', { name: 'Close filters' }).click();
    await expect(page.locator('main article')).toHaveCount(2); await expect(page.locator('main article h3')).toHaveText([names[1], names[2]]); await audit.check();
  } finally {
    if (orderNumber) await page.request.post(`/api/admin/orders/${orderNumber}/cancel`);
    for (const id of reviews) await page.request.delete('/api/admin/reviews', { data: { id } });
    for (const product of products.slice(1)) await page.request.delete('/api/admin/products', { data: { id: product._id } });
    await cleanup(page, data);
  }
});
