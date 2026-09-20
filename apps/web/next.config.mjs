/** @type {import('next').NextConfig} */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

const nextConfig = {
  // El proyecto lintea por su cuenta (`npm run lint` en la raíz, con su
  // propio .eslintrc.json — nunca usó `eslint-config-next`). El paso de
  // lint interno de `next build` antes solo emitía un warning ("Next.js
  // plugin was not detected..."); en Next 15 pasó a ser un error duro por
  // una API de ESLint que ya no es compatible con esa config. Se
  // deshabilita acá para no duplicar/romper un lint que ya corre aparte.
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: supabaseHostname
      ? [
          {
            protocol: 'https',
            hostname: supabaseHostname,
            pathname: '/storage/v1/object/public/exercise-media/**',
          },
        ]
      : [],
  },
};

export default nextConfig;
