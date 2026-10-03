import jwt from 'jsonwebtoken';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  roles: string[];
  iat?: number;
  exp?: number;
}

export interface TokenService {
  sign(claims: Omit<AccessTokenClaims, 'iat' | 'exp'>, expiresIn: string): string;
  verify(token: string): AccessTokenClaims;
}

export function createTokenService(secret: string): TokenService {
  return {
    sign(claims, expiresIn) {
      return jwt.sign({ ...claims }, secret, {
        algorithm: 'HS256',
        expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
      });
    },
    verify(token) {
      const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
      if (typeof decoded === 'string') throw new Error('Unexpected token payload');
      return decoded as unknown as AccessTokenClaims;
    },
  };
}