# Empaquetado Android (TWA) para Play Store — Diseño

## Contexto

`apps/web` (Next.js App Router, SSR + Server Actions, sesión vía cookies
`httpOnly`/`secure`/`sameSite=lax`, ver `apps/web/lib/session-writable.ts`)
corre hoy en Vercel bajo un subdominio `*.vercel.app` (sin dominio propio
todavía). Ya existe `apps/web/app/manifest.ts` con nombre, colores e
íconos 192x192/512x512 — la app ya cumple los requisitos mínimos de una
PWA instalable.

Se quiere poder generar un APK/AAB y eventualmente publicarlo en Google
Play Store.

## Alcance de este diseño

**Sí incluye:** empaquetar la web actual (single-tenant, un solo
gimnasio — "Mix Entrenamiento") como app Android instalable vía Play
Store, sin tocar la lógica de negocio de `apps/api` ni `apps/web`.

**No incluye (explícitamente descartado por ahora):**

- Cualquier funcionalidad nativa que el navegador no dé hoy (push
  notifications, cámara, biometría, uso offline real).
- Theming/branding dinámico por gimnasio según quién se loguea (ícono de
  la app y de la ventana web cambiando según el gym del usuario). Es una
  idea a futuro, ligada a la Fase 3 multi-gym de `docs/hld-mvp.md` —
  registrada como memoria de proyecto, requiere su propio diseño cuando
  se retome (los íconos de una app Android se fijan en build time, no en
  runtime, así que probablemente implique una app por gym o resolver el
  theming solo dentro de la interfaz web).
- Assets de marketing de la ficha de Play Store (feature graphic,
  capturas) y la cuenta de Google Play Developer — responsabilidad del
  usuario, no código.

## Enfoque elegido: TWA (Trusted Web Activity) vía Bubblewrap

Se descarta Capacitor: agrega una capa de WebView completa y superficie
de mantenimiento (plugins nativos, ciclo de build propio) para un
beneficio nulo hoy, ya que no se necesita ninguna API nativa. Play Store
además mira con más recelo un WebView genérico sin valor nativo agregado
que una TWA declarada como tal.

TWA usa Chrome Custom Tabs para renderizar el dominio real de producción
dentro de un shell Android mínimo. Ventajas concretas para este proyecto:

- Bubblewrap genera el proyecto Android leyendo `manifest.ts` — cero
  reimplementación de UI.
- Las cookies de sesión (`httpOnly`/`secure`/`sameSite=lax`) funcionan
  exactamente igual que en el navegador porque es Chrome real — no hay
  cambio de código en `apps/web` ni `apps/api`.
- Es el camino que Google documenta oficialmente para llevar una PWA a
  Play Store.

## Arquitectura y archivos

**1. Nuevo directorio `android-twa/` en la raíz del monorepo** (fuera de
`apps/`, para no chocar con el glob `apps/*` de `pnpm-workspace.yaml` —
no es un paquete npm, es un proyecto Gradle). Generado con:

```
npx @bubblewrap/cli init --manifest=https://<dominio-vercel>/manifest.webmanifest
```

Se commitea el proyecto Android generado (Kotlin/Java mínimo + Gradle
wrapper). **Nunca se commitea el keystore de firma** (`.gitignore` del
repo debe cubrir `android-twa/*.jks` / `*.keystore`).

**2. Verificación de dominio — Digital Asset Links**

Nuevo archivo `apps/web/public/.well-known/assetlinks.json`, con el
SHA-256 del certificado del keystore de release. Sin este archivo, la
Custom Tab muestra una barra de URL (rompe el look nativo). Riesgo
conocido: si el dominio cambia en el futuro (`*.vercel.app` → dominio
propio), hay que regenerar y redeployar este archivo.

**3. Keystore de release**

Se genera una única vez con `keytool` (Java), **fuera del repositorio**
(gestor de contraseñas o similar). Se usa para:

- Firmar el AAB/APK subido a Play Store.
- Calcular el SHA-256 que va en `assetlinks.json`.

Perder este keystore significa no poder publicar actualizaciones nunca
más bajo el mismo `applicationId` en Play Store — se documenta como
advertencia explícita en un `README.md` dentro de `android-twa/`.

**4. Página de política de privacidad**

Nueva ruta `apps/web/app/privacidad/page.tsx` — página estática (no
flujo de consentimiento, no contenido dinámico) que declara qué datos se
guardan (nombre, usuario, rutinas) y que no se comparten con terceros.
Es requisito obligatorio de Play Store para cualquier app con login, y
se linkea desde la ficha de Play Store.

## Testing

- Build local del AAB/APK vía Gradle, instalación en emulador o
  dispositivo físico Android para validar: login, persistencia de
  sesión al cerrar/reabrir la app, y que la Custom Tab no muestre barra
  de URL (confirma que `assetlinks.json` está bien servido y verificado).
- No aplica testing automatizado nuevo — no hay lógica de negocio nueva,
  es empaquetado.

## Riesgos conocidos (no bloqueantes)

- Dominio `*.vercel.app` en vez de uno propio: si migra en el futuro,
  hay que regenerar `assetlinks.json`.
- Pérdida del keystore de release: bloquea actualizaciones futuras del
  APK en Play Store — mitigado con la advertencia en el README y
  guardado fuera del repo.
