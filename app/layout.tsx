import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BOSC Asset Capture',
  description: 'Capture asset tags and nameplates in the field',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0d10',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                // Auto-update: when a newly deployed service worker takes
                // control, reload the page once so the running session swaps to
                // the new code — no tech has to close or refresh the app.
                var refreshing = false;
                var hadController = !!navigator.serviceWorker.controller;
                navigator.serviceWorker.addEventListener('controllerchange', function () {
                  if (refreshing) return;
                  // First-ever install claims the page with no prior controller;
                  // don't reload on that (nothing to swap). Only reload on updates.
                  if (!hadController) { hadController = true; return; }
                  refreshing = true;
                  window.location.reload();
                });
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js').then(function (reg) {
                    // Long-lived PWA sessions won't navigate for hours, so poll
                    // for a new deploy when the app regains focus and hourly.
                    var check = function () { reg.update().catch(function () {}); };
                    window.addEventListener('focus', check);
                    document.addEventListener('visibilitychange', function () {
                      if (document.visibilityState === 'visible') check();
                    });
                    setInterval(check, 3600000);
                  }).catch(function () {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
