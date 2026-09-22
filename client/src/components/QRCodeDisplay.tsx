import { QRCodeSVG } from 'qrcode.react';

interface Props {
  url: string;
  code: string;
  /** Sized so the back row of a classroom can still scan it. */
  size?: number;
  hint?: string;
}

export default function QRCodeDisplay({ url, code, size = 260, hint }: Props) {
  return (
    <div className="join-card">
      <div className="join-qr">
        <QRCodeSVG
          value={url}
          size={size}
          level="M"
          marginSize={2}
          bgColor="#ffffff"
          fgColor="#0b0b0b"
        />
      </div>

      <div className="join-detail">
        <p className="join-step">Scan with your phone camera</p>
        <p className="join-or">or go to</p>
        <p className="join-url">{url.replace(/^https?:\/\//, '').split('?')[0]}</p>
        <p className="join-or">and enter code</p>
        <p className="join-code" aria-label={`Session code ${code.split('').join(' ')}`}>
          {code}
        </p>
        {hint && <p className="join-hint">{hint}</p>}
      </div>
    </div>
  );
}
