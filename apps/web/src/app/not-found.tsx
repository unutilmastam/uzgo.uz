// Requests outside a locale are redirected by the proxy, so this global
// fallback is rarely seen. Localised 404s live in app/[locale]/not-found.tsx.
export default function GlobalNotFound() {
  return (
    <html lang="uz">
      {/* eslint-disable-next-line react/jsx-no-literals -- no locale context here */}
      <body style={{ fontFamily: 'system-ui', padding: 32 }}>404</body>
    </html>
  );
}
