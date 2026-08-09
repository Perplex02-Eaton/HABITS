# Habits — Tu vida, organizada

App PWA que corre en tu **celular, tablet y laptop**. Controla tus cursos, tu
alimentación, tus ideas para X e Instagram, tus tareas, tu rendimiento y la
**frecuencia de Dios (244 Hz)** — todo con una interfaz limpia estilo Apple.

## Funciones

| Pantalla | Qué hace |
| --- | --- |
| **Hoy** | Resumen del día: hora, próxima clase, comidas, tareas, racha y tu rendimiento |
| **Cursos** | Materias de la universidad con horario semanal, aula y modo en línea |
| **Comidas** | Plan diario (desayuno, almuerzo, cena, snack), planifica mañana, recuerda qué consumir, copia planes |
| **Ideas** | Analiza geopolítica/trading → genera post de X (≤280) y caption de Instagram, abre X y Canva |
| **Tareas** | Trabajos con fecha/hora, prioridad, curso y recordatorios |
| **Música** | Reproductor de frecuencias: **244 Hz (Dios)**, solfeggio 174–963, 432 Hz |
| **Rendimiento** | Gráfica tipo trading de tu avance por categoría (académico, salud, disciplina, energía, foco) |
| **Ajustes** | Nombre, redes, notificaciones, tema claro/oscuro y sincronización en la nube |

## Puesta en marcha

```bash
npm install
npm run dev        # desarrollo: http://localhost:5173
npm run build      # compila producción en /dist
npm run preview    # prueba la build de producción
```

## Instalarla en tus dispositivos

- **Laptop**: abre la URL, clic en el ícono de instalar de la barra del navegador.
- **Android (celular/tablet)**: Chrome → menú ⋮ → «Instalar aplicación».
- **iPhone/iPad**: Safari → botón Compartir → «Añadir a pantalla de inicio».

Necesitas servirlo por HTTPS para instalarla y para las notificaciones. Puedes
subir la carpeta `dist/` a **Netlify**, **Vercel** o **Cloudflare Pages** (gratis)
y tendrás una URL fija para abrirla desde cualquier dispositivo.

## Sincronización en la nube (opcional)

Habits funciona 100 % offline guardando en tu dispositivo. Para **sincronizar
entre celular, tablet y laptop**:

1. Crea un proyecto gratis en https://supabase.com
2. En el **Editor SQL**, ejecuta el contenido de `supabase/schema.sql`
3. Copia `.env.example` a `.env` y pon tus credenciales:
   ```
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-clave-anon
   ```
4. En la app, ve a **Ajustes → Sincronización en la nube → Activar**
   y crea una cuenta con tu correo (la misma cuenta en los 3 dispositivos).

## Notas

- Los recordatorios aparecen como notificaciones del navegador mientras la app
  está abierta. Los navegadores limitan las notificaciones de fondo; abre la app
  unos minutos al día para que te avise.
- El botón de X abre el cuadro de escribir con tu post ya redactado.
- El botón de Canva abre una búsqueda de plantillas según tu tema para diseñar
  el post.

## Cuentas, propietario y suscripciones

La versión comercial usa Supabase Auth y Mercado Pago. El plan gratis conserva
los datos localmente; el plan Estudiante y la cuenta propietaria obtienen acceso
premium y sincronización.

1. Ejecuta `supabase/schema.sql` en el Editor SQL de Supabase.
2. Crea tu cuenta desde Ajustes. Luego conviértela en la única propietaria:

   ```sql
   insert into public.app_admins(user_id)
   select id from auth.users where email = 'TU_CORREO@EJEMPLO.COM'
   on conflict (user_id) do nothing;
   ```

   No concedas acceso de escritura a `app_admins` desde el navegador.

3. Para acceso con Google, activa Google en Supabase > Authentication > Providers
   y registra la callback indicada por Supabase en Google Cloud. Añade la URL
   pública de Habits en Authentication > URL Configuration.
4. Crea una aplicación de Mercado Pago y configura estos secretos del servidor:

   ```bash
   supabase secrets set MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
   supabase secrets set MERCADOPAGO_WEBHOOK_SECRET=...
   supabase secrets set APP_URL=https://tu-dominio.com
   ```

5. Despliega las funciones:

   ```bash
   supabase functions deploy create-subscription
   supabase functions deploy mercadopago-webhook --no-verify-jwt
   ```

6. En Mercado Pago > Tus integraciones > Webhooks, registra:

   ```text
   https://TU-PROYECTO.supabase.co/functions/v1/mercadopago-webhook
   ```

   Activa las notificaciones de suscripciones. La función valida `x-signature`,
   consulta el estado real en Mercado Pago y procesa cada evento una sola vez.

Las credenciales `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` y
`SUPABASE_SERVICE_ROLE_KEY` nunca deben usar el prefijo `VITE_` ni guardarse en
el repositorio. Los registros de cobro de Mercado Pago no sustituyen una boleta
o factura electrónica de SUNAT.
