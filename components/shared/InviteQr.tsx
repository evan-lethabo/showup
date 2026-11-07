'use client';
// QR for the guest invite URL (the same string "Copy link" copies). Regenerated only when the URL changes.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function InviteQr({ url }: { url: string }) {
  const [src, setSrc] = useState<{ url: string; data: string } | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(url, { margin: 2, width: 320, errorCorrectionLevel: 'M', color: { dark: '#333333', light: '#FFFFFF' } })
      .then((data) => {
        if (live) setSrc({ url, data });
      })
      .catch(() => {
        if (live) setSrc(null);
      });
    return () => {
      live = false;
    };
  }, [url]);
  if (!src || src.url !== url) return null;
  return (
    <figure className="invite-qr">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src.data} width={148} height={148} alt="QR code for the guest invite link" />
      <figcaption className="small">Scan to join</figcaption>
    </figure>
  );
}
