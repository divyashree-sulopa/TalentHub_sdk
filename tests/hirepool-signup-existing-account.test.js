/**
 * Signing up with an email that already has a HirePool account: the API answers 409, the SDK
 * passes on EMAIL_ALREADY_REGISTERED, and the signup form is drawn again with that code and the
 * email so the card can say "You already have an account, sign in" (before this fix the form was
 * redrawn blank and the visitor saw nothing).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {
  HirePoolSignupCoordinator,
  HIREPOOL_SIGNUP_STATES,
  EMAIL_ALREADY_REGISTERED
} from '../widget/src/hirepool-signup.js';
import { createHirePoolSignupRouter } from '../backend/src/routes/hirepool-signup.js';

test('SDK backend reports an existing account as 409 EMAIL_ALREADY_REGISTERED', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ detail: 'Email already registered' }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' }
  });
  const app = express();
  app.use(express.json());
  app.use('/signup', createHirePoolSignupRouter({ fetchImpl }));
  const res = await request(app)
    .post('/signup/register')
    .set('Origin', 'http://localhost:3000')
    .send({
      email: 'taken@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
      userType: 'candidate',
      acceptAgreement: true,
      agreementVersionId: 'agr-1'
    });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.error.code, EMAIL_ALREADY_REGISTERED);
});

test('the signup form is redrawn with the "account exists" code and the email kept', async () => {
  const states = [];
  const apiClient = {
    getSignupAgreement: async () => ({ id: 'agr-1', version: 3, content: 'Terms' }),
    signupRegister: async () => {
      const err = new Error('This email address is already registered. Please log in or use password reset.');
      err.status = 409;
      err.code = EMAIL_ALREADY_REGISTERED;
      throw err;
    }
  };
  const coordinator = new HirePoolSignupCoordinator({
    apiClient,
    onStateChange: (state, data) => states.push({ state, data })
  });
  await coordinator.selectRole('candidate');
  await assert.rejects(
    coordinator.submitSignup({ email: 'taken@example.com', password: 'Password123', confirmPassword: 'Password123' }),
    err => err.code === EMAIL_ALREADY_REGISTERED
  );
  const last = states.at(-1);
  assert.equal(last.state, HIREPOOL_SIGNUP_STATES.SIGNUP_FORM);
  assert.equal(last.data.errorCode, EMAIL_ALREADY_REGISTERED);
  assert.equal(last.data.email, 'taken@example.com');
  assert.equal(last.data.role, 'candidate');
  assert.equal(last.data.agreement.id, 'agr-1', 'the agreement stays, so the form can be submitted again');
  assert.equal(coordinator.session, null, 'no signup session is started');
});
