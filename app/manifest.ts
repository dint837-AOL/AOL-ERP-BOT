import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AlliedOne ERP System',
    short_name: 'AOL ERP',
    description: 'Internal ERP for AlliedOne',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d0f18',
    theme_color: '#0d0f18',
    icons: [
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
