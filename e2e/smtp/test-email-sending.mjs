#!/usr/bin/env node

// ============================================================
// E2E Script: Test Email Sending con Nodemailer + Handlebars
// ============================================================
// Script interactivo para probar el envío de notificaciones de stock
// Muestra un menú con las 4 opciones disponibles y permite elegir cuál probar
// Uso: node e2e/smtp/test-email-sending.mjs

import nodemailer from 'nodemailer';
import hbs from 'nodemailer-express-handlebars';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import {
    mockProduct,
    mockProductVariant,
    mockSubscriber,
    backInStockAlertContext,
    backInStockAlertAdminContext,
    clientProductSubscriptionAlertNewContext,
    clientProductSubscriptionAlertReactivatedContext,
} from './mocks.mjs';
import {
    smtpConfig,
    emailConfig,
    validateSmtpConfig,
    printSmtpConfig,
} from './smtp-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// UTILIDADES
// ============================================================

function printHeader(title) {
    console.log('\n' + '='.repeat(60));
    console.log(`  ${title}`);
    console.log('='.repeat(60) + '\n');
}

function printSubHeader(title) {
    console.log(`\n📌 ${title}`);
    console.log('-'.repeat(60));
}

function printSuccess(message) {
    console.log(`✅ ${message}`);
}

function printError(message) {
    console.error(`❌ ${message}`);
}

function printInfo(message) {
    console.log(`ℹ️  ${message}`);
}

function printWarning(message) {
    console.warn(`⚠️  ${message}`);
}

// ============================================================
// MENÚ DE SELECCIÓN
// ============================================================

function showTestMenu() {
    console.log('\n📧 Selecciona el tipo de notificación a probar:\n');
    console.log('  1. 🛒 back-in-stock-alert (Cliente)');
    console.log('     → Notificación a cliente cuando producto vuelve a estar disponible\n');
    console.log('  2. 👨‍💼 back-in-stock-alert-admin (Admin)');
    console.log('     → Confirmación a admin del envío de alertas\n');
    console.log('  3. 🆕 client-product-subscription-alert - Nueva (Admin)');
    console.log('     → Notificación a admin de nueva suscripción de cliente\n');
    console.log('  4. 🔄 client-product-subscription-alert - Reactivada (Admin)');
    console.log('     → Notificación a admin de suscripción reactivada\n');
    console.log('  0. ❌ Salir\n');
}

function getUserSelection() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('Elige una opción (0-4): ', (answer) => {
            rl.close();
            resolve(parseInt(answer.trim()));
        });
    });
}

// ============================================================
// CREAR TRANSPORTER NODEMAILER
// ============================================================

function createTransporter() {
    const transporter = nodemailer.createTransport(smtpConfig);

    // Configurar Handlebars
    const handlebarsOptions = {
        viewEngine: {
            partialsDir: path.join(__dirname, '../../src/templates/partials/'),
            defaultLayout: false,
        },
        viewPath: path.join(__dirname, '../../src/templates/emails/'),
        extName: '.handlebars',
    };

    transporter.use('compile', hbs(handlebarsOptions));

    return transporter;
}

// ============================================================
// PRUEBAS DE EMAILS
// ============================================================

/**
 * Test 1: Enviar back-in-stock-alert (Notificación a cliente)
 */
async function testBackInStockAlert(transporter) {
    printSubHeader('Test 1: back-in-stock-alert (Cliente)');

    console.log('📧 Enviando notificación a cliente...\n');
    console.log('Datos:');
    console.log(`  - Destinatario: ${mockSubscriber.email}`);
    console.log(`  - Producto: ${mockProductVariant.title}`);
    console.log(`  - SKU: ${mockProductVariant.sku}`);
    console.log(`  - Precio: €${backInStockAlertContext.product_price}`);
    console.log(`  - Template: back-in-stock-alert\n`);

    try {
        const mailOptions = {
            from: { name: emailConfig.sender, address: emailConfig.from },
            to: mockSubscriber.email,
            subject: `${mockProductVariant.title} - ¡Ya disponible!`,
            template: 'back-in-stock-alert',
            context: backInStockAlertContext,
        };

        console.log('📤 Enviando email...');
        const info = await transporter.sendMail(mailOptions);

        printSuccess(`Email enviado exitosamente`);
        console.log(`  - Message ID: ${info.messageId}`);
        console.log(`  - Response: ${info.response}\n`);

        return true;
    } catch (error) {
        printError(`Error al enviar email: ${error.message}`);
        console.error(error);
        return false;
    }
}

/**
 * Test 2: Enviar back-in-stock-alert-admin
 * (Confirmación a admin de envío de alertas)
 */
async function testBackInStockAlertAdmin(transporter) {
    printSubHeader('Test 2: back-in-stock-alert-admin (Admin)');

    console.log('📧 Enviando confirmación al admin...\n');
    console.log('Datos:');
    console.log(`  - Destinatario: ${emailConfig.adminEmail}`);
    console.log(`  - Producto: ${mockProductVariant.title}`);
    console.log(`  - Suscriptores notificados: ${backInStockAlertAdminContext.subscribers_count}`);
    console.log(`  - Template: back-in-stock-alert-admin\n`);

    console.log('Suscriptores notificados:');
    backInStockAlertAdminContext.subscribers.forEach((sub, index) => {
        console.log(`  ${index + 1}. ${sub.email}`);
    });
    console.log();

    try {
        const mailOptions = {
            from: { name: emailConfig.sender, address: emailConfig.from },
            to: emailConfig.adminEmail,
            subject: `[Copia] Aviso de disponibilidad: ${mockProductVariant.title}`,
            template: 'back-in-stock-alert-admin',
            context: backInStockAlertAdminContext,
        };

        console.log('📤 Enviando email...');
        const info = await transporter.sendMail(mailOptions);

        printSuccess(`Email enviado exitosamente`);
        console.log(`  - Message ID: ${info.messageId}`);
        console.log(`  - Response: ${info.response}\n`);

        return true;
    } catch (error) {
        printError(`Error al enviar email: ${error.message}`);
        console.error(error);
        return false;
    }
}

/**
 * Test 3a: Enviar client-product-subscription-alert (Nueva suscripción)
 */
async function testClientProductSubscriptionAlertNew(transporter) {
    printSubHeader('Test 3a: client-product-subscription-alert - Nueva (Admin)');

    console.log('📧 Enviando notificación de nueva suscripción...\n');
    console.log('Datos:');
    console.log(`  - Destinatario: ${emailConfig.adminEmail}`);
    console.log(`  - Tipo: Nueva suscripción`);
    console.log(`  - Email cliente: ${clientProductSubscriptionAlertNewContext.subscriber_email}`);
    console.log(`  - Producto: ${mockProductVariant.title}`);
    console.log(`  - Template: client-product-subscription-alert\n`);

    try {
        const mailOptions = {
            from: { name: emailConfig.sender, address: emailConfig.from },
            to: emailConfig.adminEmail,
            subject: `[Copia] Nueva suscripción: ${mockProductVariant.title}`,
            template: 'client-product-subscription-alert',
            context: clientProductSubscriptionAlertNewContext,
        };

        console.log('📤 Enviando email...');
        const info = await transporter.sendMail(mailOptions);

        printSuccess(`Email enviado exitosamente`);
        console.log(`  - Message ID: ${info.messageId}`);
        console.log(`  - Response: ${info.response}\n`);

        return true;
    } catch (error) {
        printError(`Error al enviar email: ${error.message}`);
        console.error(error);
        return false;
    }
}

/**
 * Test 3b: Enviar client-product-subscription-alert (Reactivada)
 */
async function testClientProductSubscriptionAlertReactivated(transporter) {
    printSubHeader('Test 3b: client-product-subscription-alert - Reactivada (Admin)');

    console.log('📧 Enviando notificación de suscripción reactivada...\n');
    console.log('Datos:');
    console.log(`  - Destinatario: ${emailConfig.adminEmail}`);
    console.log(`  - Tipo: Suscripción reactivada`);
    console.log(`  - Email cliente: ${clientProductSubscriptionAlertReactivatedContext.subscriber_email}`);
    console.log(`  - Producto: ${mockProductVariant.title}`);
    console.log(`  - Template: client-product-subscription-alert\n`);

    try {
        const mailOptions = {
            from: { name: emailConfig.sender, address: emailConfig.from },
            to: emailConfig.adminEmail,
            subject: `[Admin] Suscripción: ${mockProductVariant.title}`,
            template: 'client-product-subscription-alert',
            context: clientProductSubscriptionAlertReactivatedContext,
        };

        console.log('📤 Enviando email...');
        const info = await transporter.sendMail(mailOptions);

        printSuccess(`Email enviado exitosamente`);
        console.log(`  - Message ID: ${info.messageId}`);
        console.log(`  - Response: ${info.response}\n`);

        return true;
    } catch (error) {
        printError(`Error al enviar email: ${error.message}`);
        console.error(error);
        return false;
    }
}

// ============================================================
// FUNCIÓN PRINCIPAL
// ============================================================


async function runTests() {
    printHeader('🧪 E2E Test: Product Alert Emails');

    // Validar configuración
    if (!validateSmtpConfig()) {
        process.exit(1);
    }

    printSmtpConfig();

    // Crear transporter
    console.log('🔧 Creando transporter Nodemailer...');
    let transporter;
    try {
        transporter = createTransporter();
        printSuccess('Transporter creado correctamente\n');
    } catch (error) {
        printError(`Error al crear transporter: ${error.message}`);
        process.exit(1);
    }

    // Verificar conexión SMTP
    console.log('🔗 Verificando conexión SMTP...');
    try {
        await transporter.verify();
        printSuccess('Conexión SMTP verificada correctamente\n');
    } catch (error) {
        printError(`Error al verificar SMTP: ${error.message}`);
        console.error('\n💡 Verifica que:');
        console.error('   1. Las credenciales SMTP son correctas');
        console.error('   2. El host SMTP es accesible');
        console.error('   3. Tu firewall permite conexiones salientes en el puerto SMTP\n');
        process.exit(1);
    }

    // Bucle principal para selección de tests
    let continueTesting = true;

    while (continueTesting) {
        showTestMenu();

        const selection = await getUserSelection();

        let result = false;
        let testName = '';

        switch (selection) {
            case 1:
                testName = 'back-in-stock-alert (Cliente)';
                result = await testBackInStockAlert(transporter);
                break;
            case 2:
                testName = 'back-in-stock-alert-admin (Admin)';
                result = await testBackInStockAlertAdmin(transporter);
                break;
            case 3:
                testName = 'client-product-subscription-alert - Nueva (Admin)';
                result = await testClientProductSubscriptionAlertNew(transporter);
                break;
            case 4:
                testName = 'client-product-subscription-alert - Reactivada (Admin)';
                result = await testClientProductSubscriptionAlertReactivated(transporter);
                break;
            case 0:
                continueTesting = false;
                printSuccess('¡Hasta luego! 👋\n');
                break;
            default:
                printError('Opción no válida. Por favor selecciona un número del 0 al 4.');
                continue;
        }

        if (selection >= 1 && selection <= 4) {
            printHeader('📊 Resultado del Test');

            if (result) {
                printSuccess(`✅ Test "${testName}" ejecutado exitosamente!`);
                console.log('\n💡 Próximos pasos:');
                console.log('  1. Revisa tu email (y carpeta de spam) en:');
                console.log(`     - Cliente: ${mockSubscriber.email}`);
                console.log(`     - Admin: ${emailConfig.adminEmail}`);
                console.log('  2. Verifica que el email se vio correctamente\n');
            } else {
                printError(`❌ Test "${testName}" falló`);
            }

            // Preguntar si quiere ejecutar otro test
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            await new Promise((resolve) => {
                rl.question('\n¿Quieres probar otro tipo de notificación? (s/n): ', (answer) => {
                    rl.close();
                    continueTesting = answer.toLowerCase().trim() === 's' || answer.toLowerCase().trim() === 'si';
                    resolve();
                });
            });
        }
    }

    // Cerrar transporter
    await transporter.close();
}
if (import.meta.url === `file://${process.argv[1]}`) {
    runTests().catch(error => {
        printError(`Error fatal: ${error.message}`);
        console.error(error);
        process.exit(1);
    });
}

export { testBackInStockAlert, testBackInStockAlertAdmin };
