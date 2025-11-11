/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Configuración para Cloud Run / Vercel
  output: 'standalone',
  // Región Firebase europe-west1
  env: {
    FIREBASE_REGION: 'europe-west1',
  },
}

module.exports = nextConfig
