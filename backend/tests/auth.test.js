const request = require('supertest');
const app = require('../app');
require('./setup');

const testUser = { name: 'Jane Doe', email: 'jane@example.com', password: 'secret123' };

describe('Auth API', () => {
  describe('POST /api/auth/register', () => {
    it('registers a new user and returns access + refresh tokens (happy path)', async () => {
      const res = await request(app).post('/api/auth/register').send(testUser);

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);
      expect(res.body.user.password).toBeUndefined();
    });

    it('rejects duplicate registration with the same email (failure case)', async () => {
      await request(app).post('/api/auth/register').send(testUser);
      const res = await request(app).post('/api/auth/register').send(testUser);

      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('rejects registration with an invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...testUser, email: 'not-an-email' });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/register').send(testUser);
    });

    it('logs in with correct credentials (happy path)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it('rejects login with the wrong password (failure case)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: 'wrongPassword' });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects login for a non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'whatever123' });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/auth/profile', () => {
    it('returns 401 with no token', async () => {
      const res = await request(app).get('/api/auth/profile');
      expect(res.statusCode).toBe(401);
    });

    it('returns the user profile with a valid token (happy path)', async () => {
      const registerRes = await request(app).post('/api/auth/register').send(testUser);
      const { accessToken } = registerRes.body;

      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.user.email).toBe(testUser.email);
    });

    it('rejects a malformed/invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer not-a-real-token');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('blacklists the access token so it can no longer be used', async () => {
      const registerRes = await request(app).post('/api/auth/register').send(testUser);
      const { accessToken, refreshToken } = registerRes.body;

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });
      expect(logoutRes.statusCode).toBe(200);

      const profileRes = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(profileRes.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('issues a new token pair given a valid refresh token', async () => {
      const registerRes = await request(app).post('/api/auth/register').send(testUser);
      const { refreshToken } = registerRes.body;

      const res = await request(app).post('/api/auth/refresh').send({ refreshToken });

      expect(res.statusCode).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it('rejects an invalid refresh token', async () => {
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'garbage' });
      expect(res.statusCode).toBe(401);
    });

    it('detects reuse of an already-rotated refresh token and revokes all sessions', async () => {
      const registerRes = await request(app).post('/api/auth/register').send(testUser);
      const { accessToken, refreshToken: originalRefreshToken } = registerRes.body;

      // First rotation — legitimate use, succeeds and retires originalRefreshToken.
      const firstRefresh = await request(app).post('/api/auth/refresh').send({ refreshToken: originalRefreshToken });
      expect(firstRefresh.statusCode).toBe(200);

      // Replaying the now-retired original token simulates a stolen-token
      // attacker (or a race) — this must be rejected AND kill every session.
      const reuseAttempt = await request(app).post('/api/auth/refresh').send({ refreshToken: originalRefreshToken });
      expect(reuseAttempt.statusCode).toBe(401);
      expect(reuseAttempt.body.message).toMatch(/reuse detected/i);

      // The rotated (legitimate) token from the first refresh should now
      // ALSO be rejected, since reuse detection revokes the whole session.
      const { refreshToken: rotatedToken } = firstRefresh.body;
      const afterRevocation = await request(app).post('/api/auth/refresh').send({ refreshToken: rotatedToken });
      expect(afterRevocation.statusCode).toBe(401);

      // The original access token should also be rejected immediately,
      // even though it hasn't naturally expired yet.
      const profileRes = await request(app).get('/api/auth/profile').set('Authorization', `Bearer ${accessToken}`);
      expect(profileRes.statusCode).toBe(401);
    });
  });

  describe('Active Sessions', () => {
    it('lists the current session after login (happy path)', async () => {
      const registerRes = await request(app).post('/api/auth/register').send(testUser);
      const { accessToken } = registerRes.body;

      const res = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${accessToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.sessions.length).toBe(1);
      expect(res.body.sessions[0].userAgent).toBeDefined();
    });

    it('revokes a specific session by ID, after which its refresh token no longer works', async () => {
      const registerRes = await request(app).post('/api/auth/register').send(testUser);
      const { accessToken, refreshToken } = registerRes.body;

      const sessionsRes = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${accessToken}`);
      const sessionId = sessionsRes.body.sessions[0].id;

      const revokeRes = await request(app)
        .delete(`/api/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(revokeRes.statusCode).toBe(200);

      const refreshRes = await request(app).post('/api/auth/refresh').send({ refreshToken });
      expect(refreshRes.statusCode).toBe(401);
    });

    it('rejects session list requests with no token', async () => {
      const res = await request(app).get('/api/auth/sessions');
      expect(res.statusCode).toBe(401);
    });
  });
});
