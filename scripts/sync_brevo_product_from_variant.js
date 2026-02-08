const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');

function readEnv(envPath) {
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const env = {};
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)=(.*)$/);
    if (m) {
      env[m[1]] = m[2].trim();
    }
  }
  return env;
}

async function fetchJson(url, apiKey) {
  const res = await fetch(url, { headers: { 'api-key': apiKey, Accept: 'application/json' } });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch(e) { json = text; }
  return { status: res.status, json };
}

async function main(variantId, productId) {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('.env file not found');
    process.exit(2);
  }
  const env = readEnv(envPath);
  const apiKey = env.BREVO_API_KEY;
  const base = (env.BREVO_API_URL || 'https://api.brevo.com/v3').replace(/\/$/, '');
  if (!apiKey) {
    console.error('BREVO_API_KEY not set');
    process.exit(2);
  }

  // Get variant from Brevo
  const variantUrl = `${base}/products/${encodeURIComponent(variantId)}`;
  console.log('Fetching variant from Brevo:', variantUrl);
  const v = await fetchJson(variantUrl, apiKey);
  console.log('Variant fetch HTTP', v.status);
  if (v.status !== 200) {
    console.error('Variant not found:', JSON.stringify(v.json, null, 2));
    process.exit(2);
  }
  const variant = v.json;

  // Build product payload using variant data
  const payload = {
    id: productId,
    name: variant.metaInfo?.product_handle || variant.name || productId,
    url: variant.url ? variant.url.split('?')[0] : undefined,
    imageUrl: variant.imageUrl,
    price: variant.price,
    stock: variant.stock || 0,
    sku: variant.sku || undefined,
    metaInfo: {
      synced_from_variant: variantId,
      origin_variant_name: variant.name,
    }
  };

  console.log('Creating product in Brevo with payload:', JSON.stringify(payload, null, 2));
  const createUrl = `${base}/products`;
  const res = await fetch(createUrl, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  console.log('Create product HTTP', res.status);
  const createdText = await res.text();
  let createdJson;
  try { createdJson = JSON.parse(createdText); } catch(e) { createdJson = createdText; }
  console.log(JSON.stringify(createdJson, null, 2));

  // Verify product exists
  const prodUrl = `${base}/products/${encodeURIComponent(productId)}`;
  const p = await fetchJson(prodUrl, apiKey);
  console.log('Product fetch HTTP', p.status);
  console.log(JSON.stringify(p.json, null, 2));
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node scripts/sync_brevo_product_from_variant.js <variant_id> <product_id>');
  process.exit(2);
}

main(args[0], args[1]).catch((e)=>{ console.error('Error:', e); process.exit(2); });
