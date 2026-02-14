#!/usr/bin/env node

/**
 * SMTP Connection Test Script
 * 
 * Run this script to verify SMTP connectivity in Railway or any production environment.
 * 
 * Usage:
 *   node scripts/test-smtp-connection.js
 * 
 * Or in Railway shell:
 *   npm run test:smtp
 */

const nodemailer = require('nodemailer');

console.log('\n=== SMTP Connection Test ===\n');

// Load environment variables
const config = {
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true' || parseInt(process.env.SMTP_PORT || '587', 10) === 465,
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.SMTP_FROM || process.env.SMTP_USER,
};

// Validate configuration
console.log('1. Configuration Check:');
console.log(`   Host: ${config.host}`);
console.log(`   Port: ${config.port}`);
console.log(`   Secure: ${config.secure}`);
console.log(`   User: ${config.user ? config.user.substring(0, 4) + '***' : 'NOT SET'}`);
console.log(`   Pass: ${config.pass ? '***' + config.pass.substring(config.pass.length - 4) : 'NOT SET'}`);
console.log(`   From: ${config.from}\n`);

if (!config.user || !config.pass) {
  console.error('❌ ERROR: SMTP_USER and SMTP_PASS must be set');
  process.exit(1);
}

// Create transporter
console.log('2. Creating transporter...');
const transporter = nodemailer.createTransport({
  host: config.host,
  port: config.port,
  secure: config.secure,
  connectionTimeout: 120000,
  greetingTimeout: 30000,
  socketTimeout: 120000,
  auth: {
    user: config.user,
    pass: config.pass,
  },
  tls: {
    rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
    minVersion: 'TLSv1.2',
  },
  logger: true,
  debug: true,
});

console.log('   ✓ Transporter created\n');

// Test connection
console.log('3. Testing connection...');
console.log('   (This may take up to 2 minutes with extended timeouts)\n');

const startTime = Date.now();

transporter.verify((error, success) => {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  if (error) {
    console.error(`❌ Connection FAILED after ${duration}s:\n`);
    console.error('   Error:', error.message);
    console.error('   Code:', error.code || 'N/A');
    console.error('   Command:', error.command || 'N/A');
    
    console.log('\n📋 Troubleshooting Tips:');
    console.log('   - Verify SMTP credentials in Brevo dashboard');
    console.log('   - Check if Railway allows outbound connections on port', config.port);
    console.log('   - Try using port 465 with SMTP_SECURE=true');
    console.log('   - Check Brevo service status: https://status.brevo.com/');
    console.log('   - Contact Railway support about SMTP restrictions');
    
    process.exit(1);
  }
  
  console.log(`✅ Connection successful! (${duration}s)\n`);
  console.log('4. Sending test email...\n');
  
  // Send test email
  const testEmail = {
    from: {
      address: config.from,
      name: process.env.SMTP_SENDER || 'SMTP Test',
    },
    to: config.user, // Send to self
    subject: `SMTP Test - ${new Date().toISOString()}`,
    text: `This is a test email sent from Railway environment.\n\nConfiguration:\n- Host: ${config.host}\n- Port: ${config.port}\n- Secure: ${config.secure}\n- Time: ${new Date().toISOString()}`,
    html: `
      <h2>SMTP Test Email</h2>
      <p>This is a test email sent from Railway environment.</p>
      <h3>Configuration:</h3>
      <ul>
        <li><strong>Host:</strong> ${config.host}</li>
        <li><strong>Port:</strong> ${config.port}</li>
        <li><strong>Secure:</strong> ${config.secure}</li>
        <li><strong>Time:</strong> ${new Date().toISOString()}</li>
      </ul>
    `,
  };
  
  const sendStartTime = Date.now();
  
  transporter.sendMail(testEmail, (error, info) => {
    const sendDuration = ((Date.now() - sendStartTime) / 1000).toFixed(2);
    
    if (error) {
      console.error(`❌ Email sending FAILED after ${sendDuration}s:\n`);
      console.error('   Error:', error.message);
      
      process.exit(1);
    }
    
    console.log(`✅ Email sent successfully! (${sendDuration}s)\n`);
    console.log('   Message ID:', info.messageId);
    console.log('   Response:', info.response);
    console.log('\n✅ All tests passed! SMTP is working correctly.\n');
    
    process.exit(0);
  });
});
