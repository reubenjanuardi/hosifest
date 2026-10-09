'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ApiError } from '@/lib/api';
import { adminLogin } from '@/lib/admin-api';
import { writeSession } from '@/lib/admin-auth';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';

/**
 * Admin sign-in.
 *
 * The backend issues a Bearer JWT from POST /api/v1/admin/login and rejects any
 * /api/v1/admin request without it. This form is only the credential exchange;
 * every authorization decision is made server-side.
 *
 * The backend returns a single message for both an unknown email and a wrong
 * password (identity.service.ts), so the form shows that message verbatim rather
 * than hinting which half was wrong.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const { token, user } = await adminLogin(email.trim(), password);
      writeSession(token, user);
      // The session now lives in localStorage, which the guard below reads on
      // the client. A full replace keeps the login page out of the history so
      // the back button cannot return to a stale form.
      router.replace('/admin');
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError('Sign-in failed. Please try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Administration"
        title="Sign in"
        description="Staff access for configuration, payments and attendance."
      />

      <Card>
        <CardHeader
          title="Staff sign-in"
          description="Use the account created by your administrator."
        />
        <CardBody>
          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            <Field
              label="Email address"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              value={email}
              onChange={setEmail}
              required
              maxLength={255}
              disabled={submitting}
            />
            <Field
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              required
              maxLength={200}
              disabled={submitting}
            />

            {error ? (
              <Callout tone="danger" title="Could not sign in">
                {error}
              </Callout>
            ) : null}

            <Button
              type="submit"
              size="lg"
              fullWidth
              disabled={submitting || email.trim() === '' || password === ''}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardBody>
      </Card>

      <p className="mt-6 text-sm text-ink-600">
        <Link href="/" className="underline underline-offset-4">
          Back to the ticket site
        </Link>
      </p>
    </div>
  );
}