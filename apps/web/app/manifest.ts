import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gimnasio Mix',
    short_name: 'Gimnasio Mix',
    description: 'Gestión de rutinas de Gimnasio Mix',
    start_url: '/',
    display: 'standalone',
    background_color: '#141414',
    theme_color: '#141414',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
