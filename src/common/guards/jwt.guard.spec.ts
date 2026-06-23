import { JwtGuard } from './jwt.guard';
import { AuthGuard } from '@nestjs/passport';

describe('JwtGuard', () => {
  it('should extend AuthGuard with jwt strategy', () => {
    expect(new JwtGuard()).toBeInstanceOf(AuthGuard('jwt'));
  });
});
