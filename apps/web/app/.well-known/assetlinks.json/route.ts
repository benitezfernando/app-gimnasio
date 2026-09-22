import { NextResponse } from 'next/server';

// Vercel no sirve archivos/carpetas de `public/` que empiecen con un punto
// (como `.well-known/`) — confirmado en producción, funcionaba en local
// con `next start` pero daba 404 en Vercel. Por eso este archivo se sirve
// como Route Handler en vez de como asset estático.
export function GET() {
  return NextResponse.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.gimnasiofsdev.app',
        sha256_cert_fingerprints: [
          '57:FB:E1:F5:1F:14:D5:82:59:50:53:14:A3:F9:01:30:E0:56:72:3C:AF:06:D1:EF:39:9F:0C:57:65:3C:50:8A',
        ],
      },
    },
  ]);
}
