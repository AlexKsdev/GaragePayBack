import { Secret, TOTP } from 'otpauth';
import { TotpService } from './totp.service';

/** Mints a genuine code the way an authenticator app would. */
function currentCode(base32: string): string {
  return new TOTP({
    issuer: 'PureCraft',
    label: 'PureCraft',
    secret: Secret.fromBase32(base32),
  }).generate();
}

describe('TotpService', () => {
  let service: TotpService;

  beforeEach(() => {
    service = new TotpService();
  });

  it('generates a distinct base32 secret each time', () => {
    const a = service.generateSecret();
    const b = service.generateSecret();
    expect(a).toMatch(/^[A-Z2-7]+$/);
    expect(a.length).toBeGreaterThanOrEqual(16);
    expect(a).not.toBe(b);
  });

  it('accepts the code an authenticator would currently show', () => {
    const secret = service.generateSecret();
    expect(service.verify(currentCode(secret), secret)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const secret = service.generateSecret();
    const code = currentCode(secret);
    expect(
      service.verify(code === '000000' ? '111111' : '000000', secret),
    ).toBe(false);
  });

  it("rejects a valid code minted from someone else's secret", () => {
    const secret = service.generateSecret();
    const other = service.generateSecret();
    expect(service.verify(currentCode(other), secret)).toBe(false);
  });

  it('rejects malformed input instead of throwing', () => {
    const secret = service.generateSecret();
    expect(service.verify('', secret)).toBe(false);
    expect(service.verify('abc', secret)).toBe(false);
    expect(service.verify('12345678', secret)).toBe(false);
  });

  it('builds an otpauth URI carrying the issuer and secret', () => {
    const secret = service.generateSecret();
    const uri = service.toUri(secret, 'user@test.com');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('issuer=PureCraft');
    expect(uri).toContain(`secret=${secret}`);
  });

  it('renders the URI as a QR data URL', async () => {
    const secret = service.generateSecret();
    const qr = await service.toQrDataUrl(secret, 'user@test.com');
    expect(qr.startsWith('data:image/png;base64,')).toBe(true);
  });
});
