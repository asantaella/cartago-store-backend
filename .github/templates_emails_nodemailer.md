<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# que libreria recomiendas para enviar emails dinamicos a traves de un api SMTP transactional. Los templates usan notacion handlebars

Para enviar emails dinámicos transaccionales vía API SMTP con templates en Handlebars en Node.js (ideal para tu stack con MedusaJS), recomiendo **Nodemailer** combinado con el plugin **nodemailer-express-handlebars**. Esta librería es la más popular, flexible y compatible con cualquier proveedor SMTP transaccional como Brevo, Mailgun o SendGrid.[^1][^2][^3][^4]

## Instalación

Instala las dependencias vía npm:

```
npm install nodemailer nodemailer-express-handlebars handlebars
```


## Configuración Básica

Crea un transporter SMTP con tus credenciales (ej. de Brevo, que usas en proyectos Medusa):

```javascript
const nodemailer = require('nodemailer');
const hbs = require('nodemailer-express-handlebars');

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com', // Ej. Brevo SMTP
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Plugin Handlebars
transporter.use('compile', hbs({
  viewEngine: {
    extName: '.handlebars',
    partialsDir: 'views/partials/',
    defaultLayout: 'layout.handlebars',
  },
  viewPath: 'views/emails/',
  extName: '.handlebars',
}));
```

Coloca templates en `views/emails/` (ej. `welcome.handlebars` con `{{name}}` para datos dinámicos).[^5][^3][^4]

## Envío de Email

```javascript
await transporter.sendMail({
  from: 'no-reply@tutienda.com',
  to: 'cliente@example.com',
  subject: 'Confirmación de orden',
  template: 'welcome', // Nombre del archivo sin .handlebars
  context: {
    name: 'Juan',
    orderId: 'ORD-123',
    // Datos dinámicos para Handlebars
  },
});
```

Esto compila el template con Handlebars automáticamente y envía vía SMTP.[^2][^6]

## Integración con MedusaJS

Para Medusa v1.20 (tu versión), usa plugins como `medusa-plugin-nodemailer` o `tsc-tech-medusa-plugin-smtp`, que internamente usan Nodemailer + Handlebars para eventos como `order.placed` o notificaciones de stock (como tu feature con Brevo).[^7][^8][^9]

- Instala: `npm i medusa-plugin-nodemailer`
- Configura en `medusa-config.js` con tu SMTP y `templateMap` para eventos.

Es escalable, soporta layouts/particles reutilizables y funciona con proveedores transaccionales top en 2026 como Brevo o Mailgun. Si usas Medusa v2, migra a `@lumot-eu/medusa-plugin-nodemailer`.[^10][^11][^9]
<span style="display:none">[^12][^13][^14][^15][^16][^17][^18][^19]</span>

<div align="center">⁂</div>

[^1]: https://www.youtube.com/watch?v=JbmZ86Ho01s

[^2]: https://blog.tericcabrel.com/send-email-nodejs-handlebars-amazon-ses/

[^3]: https://npm.io/package/nodemailer-express-handlebars

[^4]: https://www.npmjs.com/package/nodemailer-express-handlebars

[^5]: https://stackoverflow.com/questions/45302010/how-to-use-handlebars-with-nodemailer-to-send-email

[^6]: https://github.com/yads/nodemailer-express-handlebars

[^7]: https://www.perplexity.ai/search/30cb5d7e-32f8-4067-8381-42f12c7dd160

[^8]: https://medusa.plugins.ingeniousclan.com/plugins/tsc-tech-medusa-plugin-smtp/

[^9]: https://github.com/lumot-eu/medusa-plugin-nodemailer/

[^10]: https://www.outrightcrm.com/blog/transactional-email-smtp-providers/

[^11]: https://www.theengineeringprojects.com/2026/01/5-best-smtp-services-for-developers-in-2026-tested-compared.html

[^12]: https://excellencetechnologies.in/blog/express-nodemailer-sending-mails/

[^13]: https://github.com/shammelburg/node-email-api

[^14]: https://stackoverflow.com/questions/65708025/how-to-configure-express-handlebars-to-link-it-with-nodemailer

[^15]: https://victory-nwani.dev/blog/sending-emails-using-medusa-plugin-smtp

[^16]: https://github.com/sami12344/Nodemailer

[^17]: https://mailtrap.io/blog/best-email-api-for-nodejs-developers/

[^18]: https://www.emailvendorselection.com/transactional-email-services/

[^19]: https://mailtrap.io/blog/transactional-email-services/

