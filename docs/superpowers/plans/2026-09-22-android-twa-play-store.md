# Empaquetado Android (TWA) para Play Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Nota de alcance para quien ejecute este plan:** las Tareas 1 y 2 son
> código puro de `apps/web`, aptas para subagent-driven-development. Las
> Tareas 3 a 7 manejan un keystore de firma (secreto que no debe
> commitearse ni pegarse en logs de subagentes) y requieren Android SDK +
> `keytool` + Bubblewrap CLI + (para la Tarea 6) un emulador o dispositivo
> físico — herramientas que un sandbox de subagente normalmente no tiene.
> **Ejecutá las Tareas 3-7 en la sesión inline, en tu propia máquina, no
> las delegues a un subagente.**

**Goal:** Generar un APK/AAB firmado de `apps/web` vía TWA (Trusted Web
Activity), instalable y listo para subir a Play Store, sin tocar la
lógica de negocio existente.

**Architecture:** Chrome Custom Tab (TWA) apuntando al dominio de
producción de Vercel, verificado mediante Digital Asset Links
(`assetlinks.json` servido por `apps/web`). El proyecto Android se genera
con Bubblewrap a partir de `apps/web/app/manifest.ts` y vive en un
directorio nuevo `android-twa/` en la raíz del monorepo, fuera del
workspace de pnpm.

**Tech Stack:** Next.js App Router (`apps/web`, ya existente), Bubblewrap
CLI, Android SDK / Gradle, `keytool` (JDK).

## Global Constraints

- No se modifica lógica de negocio de `apps/api` ni `apps/web` — solo se
  agrega una página estática y un archivo de verificación de dominio.
- El proyecto Android (`android-twa/`) va fuera de `apps/`, porque
  `pnpm-workspace.yaml` define `packages: ["apps/*"]` y no debe
  registrarse como paquete npm.
- El keystore de release (`.jks`) **nunca se commitea** al repositorio.
- Sin funcionalidad nativa (push, cámara, biometría) — fuera de alcance
  según el spec.
- Sin theming multitenant por gym — fuera de alcance según el spec
  (queda como trabajo futuro documentado, no se toca en este plan).

---

### Task 1: Página de política de privacidad

**Files:**

- Create: `apps/web/app/privacidad/page.tsx`

**Interfaces:**

- Consumes: nada (página estática, sin Server Actions ni fetch).
- Produces: ruta `/privacidad` accesible públicamente (sin auth), enlazada
  después desde la ficha de Play Store en la Tarea 7.

- [ ] **Step 1: Crear la página**

Es un Server Component estático — no necesita `'use client'` ni datos
dinámicos. Sigue la paleta de clases Tailwind ya usada en
`apps/web/app/login/page.tsx` (`bg-surface`, `text-text`, `border-border`).

```tsx
export const metadata = {
  title: 'Política de privacidad — Gimnasio Mix',
};

export default function PoliticaDePrivacidadPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 bg-surface px-6 py-10 text-text">
      <h1 className="text-2xl font-semibold">Política de privacidad</h1>
      <p className="text-sm text-text-muted">Última actualización: 22/09/2026</p>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Qué datos guardamos</h2>
        <p>
          Gimnasio Mix guarda únicamente los datos necesarios para operar la aplicación: tu nombre,
          tu nombre de usuario, el gimnasio al que pertenecés, y las rutinas de entrenamiento
          asignadas a tu cuenta. No pedimos ni almacenamos datos de pago, ubicación ni contactos.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Cómo se usan tus datos</h2>
        <p>
          Tus datos se usan exclusivamente para mostrarte tu rutina y permitir que tu profesor o el
          administrador de tu gimnasio la gestionen. No se comparten con terceros ni se usan con
          fines publicitarios.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Contacto</h2>
        <p>
          Si querés que eliminemos tu cuenta o tenés dudas sobre tus datos, pedíselo directamente al
          administrador de tu gimnasio.
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Verificar que compila y renderiza**

Run: `npm run build --workspace=web` (o `pnpm --filter web build`, según
cómo se invoque en este repo — confirmar con `apps/web/package.json`,
que ya tiene el script `build`).

Expected: build exitoso, sin errores de tipos. Este proyecto no tiene
tests de render de componentes de frontend (no hay ningún `.test.tsx` en
`apps/web`, y `jest.config.js` solo matchea `**/*.spec.ts`) — la
verificación de esta página estática es el build más una revisión visual
manual en `npm run dev` → `http://localhost:3000/privacidad`, no un test
automatizado nuevo.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/privacidad/page.tsx
git commit -m "feat(web): agregar pagina de politica de privacidad"
```

---

### Task 2: `.gitignore` para artefactos y secretos de Android

**Files:**

- Modify: `.gitignore`

**Interfaces:**

- Consumes: nada.
- Produces: reglas que la Tarea 4 (scaffold de `android-twa/`) y la Tarea
  3 (keystore) dan por hechas.

- [ ] **Step 1: Agregar las reglas**

Agregar al final de `.gitignore` (raíz del repo):

```
# Android TWA (Tarea android-twa/)
android-twa/*.jks
android-twa/*.keystore
android-twa/keystore.properties
android-twa/app/build/
android-twa/build/
android-twa/.gradle/
android-twa/local.properties
```

- [ ] **Step 2: Verificar**

Run: `git check-ignore -v android-twa/release.jks` (aunque el archivo no
exista todavía, `git check-ignore` solo evalúa el patrón, no requiere que
exista).

Expected: imprime la línea de `.gitignore` que matchea — confirma que la
regla está activa antes de que exista ningún keystore real que pudiera
commitearse por error.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignorar artefactos y secretos de android-twa"
```

---

### Task 3 (MANUAL — no delegar a subagente): Generar el keystore de release

**Por qué es manual:** este paso crea un secreto criptográfico de larga
vida (perderlo bloquea futuras actualizaciones de la app en Play Store).
No debe pasar por logs de subagentes ni quedar en ningún archivo que
termine commiteado.

- [ ] **Step 1: Crear el directorio y generar el keystore**

Ejecutar en tu máquina, desde la raíz del repo:

```bash
mkdir -p android-twa
keytool -genkeypair -v \
  -keystore android-twa/release.jks \
  -alias gimnasio-mix-release \
  -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` va a pedir una contraseña para el keystore y otra para la key
(podés usar la misma). **Guardalas en un gestor de contraseñas ya
mismo** — no hay forma de recuperarlas si se pierden.

- [ ] **Step 2: Guardar el `.jks` fuera del repo**

Copiá `android-twa/release.jks` a un backup fuera del working directory
(gestor de contraseñas con adjuntos, o un drive privado). El `.gitignore`
de la Tarea 2 ya evita que se commitee, pero un backup manual es la única
defensa contra perder el disco.

- [ ] **Step 3: Extraer el fingerprint SHA-256**

```bash
keytool -list -v -keystore android-twa/release.jks -alias gimnasio-mix-release
```

Buscar en la salida la línea `SHA256:` — copiar ese valor (formato
`AA:BB:CC:...`), se usa tal cual en la Tarea 5.

---

### Task 4 (MANUAL — no delegar a subagente): Scaffold del proyecto Android con Bubblewrap

**Files:**

- Create: `android-twa/` (proyecto Gradle completo, generado por la CLI)

**Interfaces:**

- Consumes: `apps/web/app/manifest.ts` (servido como
  `/manifest.webmanifest` por Next.js), la URL de producción en Vercel.
- Produces: proyecto Android buildable en `android-twa/app/`.

- [ ] **Step 1: Confirmar la URL de manifest en producción**

Con el deploy de `apps/web` ya en Vercel, abrir en el navegador:
`https://<tu-subdominio>.vercel.app/manifest.webmanifest` y confirmar que
devuelve el JSON del manifest (nombre, íconos, `theme_color`). Anotar la
URL exacta — se usa en el siguiente paso.

- [ ] **Step 2: Correr Bubblewrap init**

```bash
npx @bubblewrap/cli init \
  --manifest=https://<tu-subdominio>.vercel.app/manifest.webmanifest \
  --directory=android-twa
```

La CLI va a preguntar interactivamente: `applicationId` (usar
`com.gimnasiomix.app` o el reverse-domain que prefieras — una vez
publicado en Play Store este valor no se puede cambiar), nombre de la
app, y **la ruta al keystore de la Tarea 3** (`android-twa/release.jks`)
más su alias y contraseñas para firmar directamente el build.

Expected: termina generando el proyecto Gradle dentro de
`android-twa/app/` sin errores.

- [ ] **Step 3: Commitear el proyecto generado (sin el keystore)**

```bash
git add android-twa/
git status
```

Revisar el `git status`: no debe aparecer `release.jks` ni
`keystore.properties` (el `.gitignore` de la Tarea 2 los cubre). Si
aparecen, **no commitear** — revisar el `.gitignore` antes de seguir.

```bash
git commit -m "feat(android): scaffold del proyecto TWA con bubblewrap"
```

---

### Task 5: Digital Asset Links (`assetlinks.json`)

**Files:**

- Create: `apps/web/public/.well-known/assetlinks.json`

**Interfaces:**

- Consumes: `applicationId` de la Tarea 4, fingerprint SHA-256 de la
  Tarea 3.
- Produces: verificación de dominio que la Tarea 6 valida.

- [ ] **Step 1: Crear el archivo**

Sustituir `APPLICATION_ID` y `SHA256_FINGERPRINT` por los valores reales
obtenidos en las Tareas 3 y 4 (no son placeholders de diseño — son
valores que literalmente no existen hasta que se generan el keystore y
el proyecto Android; el formato del archivo sí es fijo y exacto):

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "APPLICATION_ID",
      "sha256_cert_fingerprints": ["SHA256_FINGERPRINT"]
    }
  }
]
```

- [ ] **Step 2: Deployar y verificar**

Commitear, pushear (o commitear y avisar que está listo para push, según
las reglas del proyecto), esperar el deploy de Vercel, y confirmar en el
navegador: `https://<tu-subdominio>.vercel.app/.well-known/assetlinks.json`
devuelve el JSON de arriba con status 200.

- [ ] **Step 3: Commit**

```bash
git add apps/web/public/.well-known/assetlinks.json
git commit -m "feat(web): agregar digital asset links para la app android"
```

---

### Task 6 (MANUAL — no delegar a subagente): Build, firma e instalación de prueba

**Files:** ninguno nuevo — usa `android-twa/` generado en la Tarea 4.

- [ ] **Step 1: Buildear el AAB firmado**

```bash
cd android-twa
./gradlew bundleRelease
```

Expected: genera `android-twa/app/build/outputs/bundle/release/app-release.aab`,
firmado con el keystore configurado en la Tarea 4.

- [ ] **Step 2: Generar un APK instalable para prueba local**

Bubblewrap trae su propio comando para esto (no hace falta pelearse con
`bundletool` a mano):

```bash
npx @bubblewrap/cli build
```

Expected: genera `android-twa/app-release-signed.apk`.

- [ ] **Step 3: Instalar en un emulador o dispositivo físico**

```bash
adb install android-twa/app-release-signed.apk
```

- [ ] **Step 4: Smoke test manual**

Abrir la app instalada y verificar:

1. Login funciona con un usuario real.
2. Cerrar la app completamente y reabrirla — la sesión sigue iniciada
   (confirma que las cookies `httpOnly`/`secure`/`sameSite=lax` de
   `apps/web/lib/session-writable.ts` sobreviven en el contexto de
   Chrome Custom Tabs).
3. **No aparece ninguna barra de URL arriba de la pantalla** — si
   aparece, el Digital Asset Link de la Tarea 5 no está verificando
   correctamente (revisar que el `applicationId` y el fingerprint SHA-256
   coincidan exactamente entre `android-twa/app/build.gradle` y
   `assetlinks.json`).

---

### Task 7 (MANUAL — no delegar a subagente): Validación final y checklist de publicación

- [ ] **Step 1: Validar el Digital Asset Link con la herramienta de Google**

```bash
npx @bubblewrap/cli validate --manifest=https://<tu-subdominio>.vercel.app/manifest.webmanifest
```

Expected: reporta el Digital Asset Link como válido.

- [ ] **Step 2: Checklist antes de subir a Play Store (fuera del alcance de código de este plan)**

- [ ] Cuenta de Google Play Developer creada (pago único, la gestiona el
      usuario).
- [ ] Ficha de la app: ícono 512x512 (ya existe en
      `apps/web/public/icons/icon-512.png`), feature graphic 1024x500 (falta
      crear, es diseño gráfico, no código), al menos 2 capturas de pantalla.
- [ ] Link a `https://<tu-subdominio>.vercel.app/privacidad` (Tarea 1)
      cargado en la sección "Privacy Policy" de Play Console.
- [ ] AAB de la Tarea 6 subido a un track interno de Play Console para
      probar la distribución antes de producción.
