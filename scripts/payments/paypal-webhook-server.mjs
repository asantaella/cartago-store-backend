#!/usr/bin/env node

/**
 * Servidor mock para interceptar webhooks de PayPal
 * 
 * Este servidor escucha en http://localhost:9001 (o el puerto especificado)
 * y registra todos los webhooks que recibe desde PayPal
 */

import express from "express";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: false });

const PORT = process.env.WEBHOOK_DEBUG_PORT || 9001;
const app = express();

app.use(express.json());
app.use(express.raw({ type: "application/json" }));

// Endpoint para recibir webhooks de PayPal
app.post("/paypal-webhook-debug", (req, res) => {
  console.log("\n" + "=".repeat(70));
  console.log("🔔 WEBHOOK RECIBIDO DE PAYPAL");
  console.log("=".repeat(70));
  
  const headers = req.headers;
  const body = req.body;
  
  console.log("\n📋 HEADERS:");
  console.log(`  transmission-id: ${headers["paypal-transmission-id"]}`);
  console.log(`  transmission-time: ${headers["paypal-transmission-time"]}`);
  console.log(`  auth-algo: ${headers["paypal-auth-algo"]}`);
  
  console.log("\n📋 BODY:");
  console.log(JSON.stringify(body, null, 2));
  
  // Extraer datos críticos
  const eventType = body?.event_type;
  const resource = body?.resource;
  const authorizationId = resource?.id;
  const status = resource?.status;
  const links = resource?.links;
  
  console.log("\n🎯 DATOS CRÍTICOS EXTRAÍDOS:");
  console.log(`  Event Type: ${eventType}`);
  console.log(`  Resource ID (Authorization ID): ${authorizationId}`);
  console.log(`  Status: ${status}`);
  console.log(`  Links:`);
  if (links) {
    links.forEach((link) => {
      console.log(`    - ${link.rel}: ${link.href}`);
    });
  }
  
  // Extraer custom_id (que vincula con Medusa)
  const purchaseUnits = resource?.purchase_units;
  if (purchaseUnits) {
    console.log(`\n  Purchase Units:`);
    purchaseUnits.forEach((pu, index) => {
      console.log(`    [${index}]:`);
      console.log(`      - custom_id: ${pu.custom_id}`);
      console.log(`      - reference_id: ${pu.reference_id}`);
      if (pu.payments?.authorizations) {
        console.log(`      - authorizations: ${pu.payments.authorizations.map(a => a.id).join(", ")}`);
      }
    });
  }
  
  console.log("\n" + "=".repeat(70));
  
  // Responder con 200 OK
  res.status(200).json({ status: "received" });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Debug Webhook Server escuchando en http://localhost:${PORT}`);
  console.log(`\n📍 Para usar este servidor con ngrok:`);
  console.log(`   1. Inicia ngrok: ngrok http ${PORT}`);
  console.log(`   2. Obtén la URL pública (ej: https://xxxx.ngrok-free.dev)`);
  console.log(`   3. En PayPal Developer, configura el webhook a: https://xxxx.ngrok-free.dev/paypal-webhook-debug`);
  console.log(`\n⏳ Esperando webhooks...`);
});
