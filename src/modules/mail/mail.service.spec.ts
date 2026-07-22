import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { AUTH_ERROR_CODES } from '../../config/error-codes.config';
import { MailService } from './mail.service';
import { RESEND_CLIENT } from './resend.provider';

const send = jest.fn();
const mockResend = { emails: { send } };

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: RESEND_CLIENT, useValue: mockResend },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('delivery failure (KAN-79)', () => {
    // Resend reports a refusal in the resolved value; a transport failure
    // arrives as a throw. Both mean nothing was delivered, and neither may
    // reach the client as a bare 500.
    const failures: [string, () => void][] = [
      [
        'the provider refuses the send',
        () => send.mockResolvedValueOnce({ error: { message: 'not allowed' } }),
      ],
      [
        'the request itself throws',
        () => send.mockRejectedValueOnce(new Error('socket hang up')),
      ],
    ];

    for (const [name, arrange] of failures) {
      it(`answers 503 when ${name}`, async () => {
        arrange();
        await expect(
          service.sendTwoFactorCode('a@b.com', '123456'),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
      });

      it(`tags a localizable code when ${name}`, async () => {
        arrange();
        await expect(
          service.sendTwoFactorCode('a@b.com', '123456'),
        ).rejects.toMatchObject({
          response: { code: AUTH_ERROR_CODES.emailDeliveryFailed },
        });
      });
    }

    it('keeps the provider reason out of the response', async () => {
      // It can name the recipient and the sending domain.
      send.mockResolvedValueOnce({
        error: { message: 'domain purecraft.net is not verified' },
      });

      await expect(
        service.sendTwoFactorCode('a@b.com', '123456'),
      ).rejects.toMatchObject({
        response: {
          message: "We couldn't send the email. Please try again in a moment.",
        },
      });
    });

    it('fails the password reset the same way', async () => {
      send.mockResolvedValueOnce({ error: { message: 'not allowed' } });

      await expect(
        service.sendPasswordReset('a@b.com', 'https://x/reset?token=t'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('success', () => {
    it('never puts the code in the log line', async () => {
      const logged: string[] = [];
      jest
        .spyOn(service['logger'], 'log')
        .mockImplementation((m) => logged.push(String(m)));
      send.mockResolvedValueOnce({ error: null });

      await service.sendTwoFactorCode('a@b.com', '123456');

      expect(logged.join(' ')).not.toContain('123456');
      expect(logged.join(' ')).toContain('a@b.com');
    });

    it('sends the code in the body', async () => {
      send.mockResolvedValueOnce({ error: null });

      await service.sendTwoFactorCode('a@b.com', '123456');

      const call = send.mock.calls[0] as [{ text: string; to: string }];
      expect(call[0].text).toContain('123456');
      expect(call[0].to).toBe('a@b.com');
    });
  });
});
