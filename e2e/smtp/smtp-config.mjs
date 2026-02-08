// ============================================================
// Configuración SMTP para E2E Testing
// ============================================================

import 'dotenv/config';

export const smtpConfig = {
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
};

export const emailConfig = {
    from: process.env.SMTP_FROM || 'equipo@cartago4x4.com',
    adminEmail: process.env.ADMIN_EMAIL || 'cartago4x4@gmail.com',
    storeUrl: process.env.STORE_URL || 'https://cartago4x4.com',
    sender: process.env.SMTP_SENDER || 'Cartago4x4',
};

/**
 * Validar configuración SMTP
 */
export function validateSmtpConfig() {
    const errors = [];

    if (!smtpConfig.auth.user) {
        errors.push('SMTP_USER no está configurado');
    }

    if (!smtpConfig.auth.pass) {
        errors.push('SMTP_PASS no está configurado');
    }

    if (!emailConfig.adminEmail) {
        errors.push('ADMIN_EMAIL no está configurado');
    }

    if (errors.length > 0) {
        console.error('\n❌ Errores de configuración:');
        errors.forEach(err => console.error(`   - ${err}`));
        console.error('\n📝 Configurar variables en .env:\n');
        console.error('   SMTP_HOST=smtp-relay.brevo.com');
        console.error('   SMTP_PORT=587');
        console.error('   SMTP_SECURE=false');
        console.error('   SMTP_USER=tu-email@brevo.com');
        console.error('   SMTP_PASS=tu-contraseña-smtp');
        console.error('   SMTP_FROM=noreply@cartago4x4.com');
        console.error('   ADMIN_EMAIL=admin@cartago4x4.com');
        console.error('   STORE_URL=https://cartago4x4.com\n');
        return false;
    }

    return true;
}

/**
 * Mostrar configuración SMTP (sin passwords)
 */
export function printSmtpConfig() {
    console.log('\n📧 SMTP Configuration:');
    console.log(`   Host: ${smtpConfig.host}`);
    console.log(`   Port: ${smtpConfig.port}`);
    console.log(`   Secure: ${smtpConfig.secure}`);
    console.log(`   User: ${smtpConfig.auth.user ? '✓ Configurado' : '✗ No configurado'}`);
    console.log(`   Pass: ${smtpConfig.auth.pass ? '✓ Configurado' : '✗ No configurado'}`);
    console.log(`\n📧 Email Configuration:`);
    console.log(`   From: ${emailConfig.from}`);
    console.log(`   Admin Email: ${emailConfig.adminEmail}`);
    console.log(`   Store URL: ${emailConfig.storeUrl}\n`);
}

export default {
    smtpConfig,
    emailConfig,
    validateSmtpConfig,
    printSmtpConfig,
};
