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
