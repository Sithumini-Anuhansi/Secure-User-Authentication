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
  });
});
