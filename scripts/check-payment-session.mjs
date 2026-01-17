import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkPaymentSession() {
  try {
    const cartId = "cart_01KF4RJDJ1JRFP5C915MNA1MGA";
    const paypalOrderId = "9CL382358D099044Y";

    console.log("\n=== Checking payment_session for cart_id:", cartId, "===\n");

    const result = await pool.query(
      `SELECT cart_id, provider_id, data, created_at, updated_at 
       FROM payment_session 
       WHERE cart_id = $1`,
      [cartId],
    );

    if (result.rows.length === 0) {
      console.log("❌ No payment session found for this cart_id");
    } else {
      result.rows.forEach((row, idx) => {
        console.log(`\n--- Payment Session ${idx + 1} ---`);
        console.log("Cart ID:", row.cart_id);
        console.log("Provider:", row.provider_id);
        console.log("Created:", row.created_at);
        console.log("Updated:", row.updated_at);
        console.log("\nData structure:");
        console.log(JSON.stringify(row.data, null, 2));
      });
    }

    console.log("\n=== Searching by PayPal order ID:", paypalOrderId, "===\n");

    const result2 = await pool.query(
      `SELECT cart_id, provider_id, data 
       FROM payment_session 
       WHERE provider_id = 'paypal' 
       AND data::jsonb @> $1::jsonb`,
      [JSON.stringify({ id: paypalOrderId })],
    );

    if (result2.rows.length === 0) {
      console.log(
        "❌ No payment session found with PayPal order ID in data.id",
      );

      // Try alternative search
      console.log(
        "\n=== Trying alternative search (data contains order_id somewhere) ===\n",
      );
      const result3 = await pool.query(
        `SELECT cart_id, provider_id, data::text 
         FROM payment_session 
         WHERE provider_id = 'paypal' 
         AND data::text LIKE $1`,
        [`%${paypalOrderId}%`],
      );

      if (result3.rows.length > 0) {
        console.log(
          "✅ Found payment session(s) containing the PayPal order ID:",
        );
        result3.rows.forEach((row, idx) => {
          console.log(`\n--- Match ${idx + 1} ---`);
          console.log("Cart ID:", row.cart_id);
          console.log("Data excerpt:", row.data.substring(0, 500));
        });
      } else {
        console.log(
          "❌ No payment session found containing this PayPal order ID anywhere",
        );
      }
    } else {
      console.log("✅ Found payment session with PayPal order ID:");
      result2.rows.forEach((row) => {
        console.log("Cart ID:", row.cart_id);
        console.log("Data:", JSON.stringify(row.data, null, 2));
      });
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await pool.end();
  }
}

checkPaymentSession();
