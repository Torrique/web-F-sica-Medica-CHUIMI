# Envío automático con Gmail API

La confirmación se enviará desde `fisicamedicachuimi@gmail.com` a `rfchuimi.scs@gobiernodecanarias.org` sin abrir el correo del trabajador.

## Requisitos

- Activar Gmail API en un proyecto de Google Cloud.
- Autorizar la cuenta remitente con permiso exclusivo de envío.
- Crear en Cloudflare los secretos requeridos por `src/worker.js`.
- Crear la base D1 y ejecutar `migrations/0001_access_codes.sql`.
- Copiar `wrangler.gmail.example.jsonc` como `wrangler.jsonc` e introducir el identificador de D1.

## Secretos del Worker

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`

## Variables del Worker

- `GMAIL_SENDER_EMAIL`: cuenta de Gmail remitente.
- `EMAIL_TO`: correo corporativo destinatario.
- `CODE_VALID_DAYS`: días de validez del código.

No se debe guardar la contraseña de Gmail en GitHub, D1 ni en el código fuente. La rama no debe fusionarse con `main` hasta que D1 y la autorización OAuth estén configurados y probados.
