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

async function getProduct(id) {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('.env file not found in project root');
    process.exit(2);
  }
  const env = readEnv(envPath);
  const apiKey = env.BREVO_API_KEY;
  const base = env.BREVO_API_URL || 'https://api.brevo.com/v3';
  if (!apiKey) {
    console.error('BREVO_API_KEY not set in .env');
    process.exit(2);
  }

  const url = `${base.replace(/\/$/, '')}/products/${encodeURIComponent(id)}`;
  try {
    const res = await fetch(url, { headers: { 'api-key': apiKey, Accept: 'application/json' } });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch(e) { json = text; }
    console.log('HTTP', res.status);
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Request failed:', err.message);
    process.exit(2);
  }
}

const id = process.argv[2];
if (!id) {
  console.error('Usage: node scripts/check_brevo_product.js <product_or_variant_id>');
  process.exit(2);
}

getProduct(id);
