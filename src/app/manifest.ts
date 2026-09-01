import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Portal Fiscal e Contábil - Fort Fruit',
    short_name: 'Fort Fruit',
    description: 'Portal de ferramentas para gestão fiscal e contábil — Fort Fruit Hortifrutigranjeiros',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#00753A',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
