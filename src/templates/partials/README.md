# Email Template Partials

Este directorio contiene los partials reutilizables para las plantillas de email de Cartago4x4.

## 📁 Estructura

```
partials/
├── footer.handlebars    # Footer común para todos los emails
└── README.md           # Esta documentación
```

## 🦶 Footer Partial (`footer.handlebars`)

### Descripción
Partial optimizado del footer que se utiliza en todos los templates de email. Incluye información de contacto, enlaces sociales, enlaces legales y copyright.

### Optimizaciones de Espacio
- **Reducción de padding**: De 40px a diseño más compacto
- **Enlaces inline**: Los enlaces de navegación se muestran en una línea separada por `|`
- **Texto conciso**: Mensaje de suscripción más breve
- **Enlaces abreviados**: "Política de privacidad" → "Privacidad", "Términos de servicio" → "Términos"

### Variables Requeridas
```handlebars
{{unsubscribe_url}}     # URL para desuscribirse
{{current_year}}        # Año actual (2025, 2026, etc.)
```

### Uso en Templates
```handlebars
<!-- Footer -->
{{> footer}}
```

### Contenido Incluido

#### Sección de Contacto
- Nombre de la empresa: Cartago4x4
- Email: contacto@cartago4x4.es
- Teléfono: +34699091026

#### Enlaces de Navegación
- Tienda: https://cartago4x4.es
- Contacto: https://cartago4x4.es/#contacto

#### Redes Sociales
- Instagram: https://www.instagram.com/cartago4x4.es/

#### Información Legal
- Mensaje de suscripción
- Enlace de desuscripción
- Política de privacidad
- Términos de servicio
- Copyright con año dinámico

## 🎨 Estilos CSS

El partial utiliza las clases CSS definidas en los templates principales:

- `.footer` - Contenedor principal del footer
- `.footer-content` - Layout de las secciones
- `.footer-section` - Cada columna del footer
- `.footer-section-title` - Títulos de las secciones
- `.footer-link` - Enlaces del footer
- `.footer-divider` - Separadores visuales
- `.footer-bottom` - Sección inferior con copyright
- `.address-info` - Información de contacto
- `.social-links` - Enlaces a redes sociales

## 📧 Templates que lo usan

- `back-in-stock-alert.handlebars` - Notificación a cliente
- `back-in-stock-alert-admin.handlebars` - Confirmación a admin
- `client-product-subscription-alert.handlebars` - Alertas de suscripción

## 🔧 Mantenimiento

### Agregar nueva información
1. Editar `footer.handlebars`
2. Probar con `node e2e/smtp/test-email-sending.mjs`
3. Verificar en email de prueba

### Cambiar enlaces
- Actualizar URLs directamente en el partial
- Asegurar que los enlaces sean válidos

### Modificar estilos
- Los estilos están en los templates principales
- Cambios afectan a todos los emails que usan el partial

## 📊 Métricas de Optimización

| Aspecto | Antes | Después | Ahorro |
|---------|-------|---------|--------|
| Altura aproximada | 200px | 160px | ~20% |
| Líneas de código | 45 líneas | 35 líneas | ~22% |
| Mantenimiento | 3 archivos | 1 archivo | 67% |

## ✅ Beneficios

- **Consistencia**: Footer idéntico en todos los emails
- **Mantenimiento**: Un solo archivo para actualizar
- **Optimización**: Menos espacio ocupado en emails
- **Reutilización**: Fácil de usar en nuevos templates
- **Legibilidad**: Código más limpio en templates principales