import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'PIV Manager Pro',
  description: 'Enterprise billing application',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          backgroundColor: '#F7F7F7',
          color: '#000',
        }}
      >
        {children}
      </body>
    </html>
  )
}
