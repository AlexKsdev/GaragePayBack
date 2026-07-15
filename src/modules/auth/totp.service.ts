import { Injectable } from '@nestjs/common';
import { Secret, TOTP } from 'otpauth';
import * as QRCode from 'qrcode';
import { TOTP_ISSUER } from '../../config/totp.config';

// Accept a code from the adjacent 30s steps too, so a user typing as the code
// rolls over isn't rejected. Wider than this starts handing attackers extra
// guessing time.
const WINDOW = 1;

/** Thin wrapper over otpauth, keeping the library's shape in one place. */
@Injectable()
export class TotpService {
  /** A fresh base32 secret to hand to the authenticator app. */
  generateSecret(): string {
    return new Secret({ size: 20 }).base32;
  }

  /** The otpauth:// URI an authenticator app scans. */
  toUri(secret: string, accountLabel: string): string {
    return this.totpFor(secret, accountLabel).toString();
  }

  /** The same URI rendered as a data-URL QR image for the setup screen. */
  toQrDataUrl(secret: string, accountLabel: string): Promise<string> {
    return QRCode.toDataURL(this.toUri(secret, accountLabel));
  }

  /** True only for a code currently valid for this secret. */
  verify(code: string, secret: string): boolean {
    let delta: number | null;
    try {
      delta = this.totpFor(secret, TOTP_ISSUER).validate({
        token: code,
        window: WINDOW,
      });
    } catch {
      // otpauth throws on malformed input (bad base32, wrong length) — that is
      // a failed verification, not a server error.
      return false;
    }
    // validate() returns the time-step delta, so 0 means "valid right now".
    // Testing truthiness here would reject exactly the codes that are correct.
    return delta !== null;
  }

  private totpFor(secret: string, accountLabel: string): TOTP {
    return new TOTP({
      issuer: TOTP_ISSUER,
      label: accountLabel,
      secret: Secret.fromBase32(secret),
    });
  }
}
