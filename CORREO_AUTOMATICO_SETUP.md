# Activación del correo automático

Esta rama prepara el envío automático de la confirmación de visualización desde un Cloudflare Worker. El navegador del trabajador no abre ninguna aplicación de correo.

## Flujo

1. El formulario solicita al Worker un código único y lo registra en D1.
2. El PDF incorpora ese código.
3. El acceso al vídeo valida el código contra D1.
4. Al completar al menos el 90 % del vídeo, la página llama a `/api/complete`.
5. El Worker impide duplicados y envía el correo al Servicio.

## Datos almacenados

La base D1 solo conserva el código, fechas, tiempos de reproducción, porcentaje y estado del envío. No se guardan nombre, DNI, teléfono, correo ni domicilio.

## Configuración pendiente en Cloudflare

1. Crear una base D1 llamada `web-fisica-medica`.
2. Ejecutar `migrations/0001_access_codes.sql`.
3. Copiar `wrangler.correo-automatico.example.jsonc` como `wrangler.jsonc`.
4. Sustituir `REEMPLAZAR_POR_DATABASE_ID` por el identificador real de D1.
5. Activar Cloudflare Email Service.
6. Verificar como destinatario `rfchuimi.scs@gobiernodecanarias.org`.
7. Incorporar un dominio remitente autorizado a Email Service.
8. Sustituir `REEMPLAZAR_POR_REMITENTE_VERIFICADO` por una dirección de ese dominio.
9. Desplegar con `npm install` y `npm run deploy`.

## Requisito imprescindible

Cloudflare no permite enviar desde una dirección cualquiera. El remitente debe pertenecer a un dominio incorporado y verificado en Email Service. Conocer el correo corporativo del Servicio no autoriza a utilizarlo como remitente.

No se deben guardar contraseñas del correo corporativo en GitHub ni introducirlas en el código.
