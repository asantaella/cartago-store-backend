#!/usr/bin/env node

/**
 * Test script for Brevo API email integration
 * 
 * This script validates the Brevo API configuration and optionally sends a test email.
 * 
 * Usage:
 *   node test-brevo-api.js --check          # Check configuration only
 *   node test-brevo-api.js --send [email]   # Send test email (requires email address)
 */

const https = require('https');
require('dotenv').config();

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkConfig() {
    log('\n🔍 Checking Brevo API configuration...\n', 'cyan');

    const requiredVars = {
        BREVO_API_KEY: process.env.BREVO_API_KEY,
        SMTP_FROM: process.env.SMTP_FROM || 'equipo@cartago4x4.es',
        SMTP_SENDER: process.env.SMTP_SENDER || 'Cartago4x4',
    };

    const optionalVars = {
        ADMIN_EMAIL: process.env.ADMIN_EMAIL,
        STORE_URL: process.env.STORE_URL || 'https://cartago4x4.es',
    };

    let hasErrors = false;

    // Check required variables
    log('Required variables:', 'blue');
    for (const [key, value] of Object.entries(requiredVars)) {
        if (key === 'BREVO_API_KEY') {
            if (!value) {
                log(`  ❌ ${key}: NOT SET`, 'red');
                hasErrors = true;
            } else {
                log(`  ✅ ${key}: ${value.substring(0, 12)}...`, 'green');
            }
        } else {
            if (!value) {
                log(`  ⚠️  ${key}: NOT SET (using default)`, 'yellow');
            } else {
                log(`  ✅ ${key}: ${value}`, 'green');
            }
        }
    }

    // Check optional variables
    log('\nOptional variables:', 'blue');
    for (const [key, value] of Object.entries(optionalVars)) {
        if (!value) {
            log(`  ⚠️  ${key}: NOT SET`, 'yellow');
        } else {
            log(`  ✅ ${key}: ${value}`, 'green');
        }
    }

    if (hasErrors) {
        log('\n❌ Configuration check FAILED!', 'red');
        log('Please set the BREVO_API_KEY environment variable.\n', 'red');
        log('Get your API key from: https://app.brevo.com/settings/keys/api', 'cyan');
        return false;
    }

    log('\n✅ Configuration check PASSED!', 'green');
    return true;
}

async function sendTestEmail(recipientEmail) {
    log('\n📧 Sending test email via Brevo API...\n', 'cyan');

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
        log('❌ BREVO_API_KEY is not set!', 'red');
        return false;
    }

    const payload = JSON.stringify({
        sender: {
            name: process.env.SMTP_SENDER || 'Cartago4x4',
            email: process.env.SMTP_FROM || 'equipo@cartago4x4.es',
        },
        to: [
            {
                email: recipientEmail,
                name: 'Test Recipient',
            },
        ],
        subject: 'Test Email - Brevo API Integration',
        htmlContent: `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9f9f9; }
            .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
            .success { color: #4CAF50; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Brevo API Test Successful!</h1>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p>This is a test email sent via the <span class="success">Brevo API</span> to verify the transactional email integration.</p>
              <p><strong>Configuration details:</strong></p>
              <ul>
                <li>API: Brevo REST API v3</li>
                <li>Service: Product Alert Notifications</li>
                <li>Date: ${new Date().toLocaleString()}</li>
              </ul>
              <p>If you received this email, the integration is working correctly! 🎉</p>
            </div>
            <div class="footer">
              <p>This is an automated test email from Cartago4x4</p>
              <p>© ${new Date().getFullYear()} Cartago4x4. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
        tags: ['test', 'brevo-api-integration'],
    });

    const options = {
        hostname: 'api.brevo.com',
        port: 443,
        path: '/v3/smtp/email',
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': apiKey,
            'content-type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
        },
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);

                    if (res.statusCode === 201) {
                        log('✅ Test email sent successfully!', 'green');
                        log(`\nMessage ID: ${response.messageId}`, 'cyan');
                        log(`Recipient: ${recipientEmail}`, 'cyan');
                        log('\nCheck your inbox and Brevo dashboard:', 'blue');
                        log('https://app.brevo.com/transactional/email/logs', 'cyan');
                        resolve(true);
                    } else {
                        log(`❌ Failed to send email (${res.statusCode})`, 'red');
                        log(`Response: ${data}`, 'red');
                        resolve(false);
                    }
                } catch (error) {
                    log(`❌ Failed to parse response: ${error.message}`, 'red');
                    log(`Raw response: ${data}`, 'red');
                    resolve(false);
                }
            });
        });

        req.on('error', (error) => {
            log(`❌ Request failed: ${error.message}`, 'red');
            resolve(false);
        });

        req.write(payload);
        req.end();
    });
}

function showUsage() {
    log('\nBrevo API Email Integration Test', 'cyan');
    log('================================\n', 'cyan');
    log('Usage:', 'blue');
    log('  node test-brevo-api.js --check              # Check configuration only', 'reset');
    log('  node test-brevo-api.js --send [email]       # Send test email\n', 'reset');
    log('Examples:', 'blue');
    log('  node test-brevo-api.js --check', 'reset');
    log('  node test-brevo-api.js --send admin@cartago4x4.es\n', 'reset');
}

// Main execution
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        showUsage();
        return;
    }

    const command = args[0];

    if (command === '--check') {
        const success = checkConfig();
        process.exit(success ? 0 : 1);
    } else if (command === '--send') {
        const email = args[1];
        if (!email) {
            log('❌ Error: Email address is required for --send command', 'red');
            showUsage();
            process.exit(1);
        }

        // First check config
        const configOk = checkConfig();
        if (!configOk) {
            process.exit(1);
        }

        // Then send test email
        const success = await sendTestEmail(email);
        process.exit(success ? 0 : 1);
    } else {
        log(`❌ Unknown command: ${command}`, 'red');
        showUsage();
        process.exit(1);
    }
}

main().catch((error) => {
    log(`❌ Unexpected error: ${error.message}`, 'red');
    process.exit(1);
});
