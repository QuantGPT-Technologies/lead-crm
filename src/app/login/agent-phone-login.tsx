'use client';

import { useEffect, useRef, useState } from 'react';
import { getAuth, inMemoryPersistence, RecaptchaVerifier, setPersistence, signInWithPhoneNumber, signOut, type ConfirmationResult } from 'firebase/auth';
import { firebaseApp, isFirebasePhoneConfigured } from '@/lib/firebase-client';
import { beginAgentOtp, firebaseAgentLogin, resetLogin } from './actions';

function friendly(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (['auth/invalid-verification-code','auth/code-expired','auth/session-expired'].includes(code)) return 'The code is incorrect or expired. Request a new code if needed.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a little before requesting another code.';
    if (code === 'auth/operation-not-allowed') return 'Phone sign-in is disabled in Firebase. Ask your administrator to enable the Phone provider. (auth/operation-not-allowed)';
    if (code === 'auth/unauthorized-domain') return 'This website is not authorized for Firebase sign-in. Ask your administrator to authorize this domain. (auth/unauthorized-domain)';
    if (code === 'auth/billing-not-enabled') return 'Firebase SMS billing is not enabled. Ask your administrator to link an active billing account to the Firebase project. (auth/billing-not-enabled)';
    if (['auth/invalid-app-credential','auth/captcha-check-failed','auth/missing-app-credential'].includes(code)) return `Google could not validate the security check. Refresh this page, allow Google reCAPTCHA in your browser, and complete the check again. (${code})`;
    if (code === 'auth/quota-exceeded') return 'Firebase SMS quota has been exceeded. Ask your administrator to check the project quota and billing. (auth/quota-exceeded)';
    if (code === 'auth/invalid-phone-number') return 'Enter a valid registered mobile number, including its country code.';
    if (code === 'auth/network-request-failed') return 'Could not reach Google verification. Check your connection and allow Google reCAPTCHA in your browser. (auth/network-request-failed)';
    return `Could not complete SMS verification. Please try again.${/^auth\/[a-z0-9-]+$/.test(code) ? ` (${code})` : ''}`;
}

export function AgentPhoneLogin({ next, enabled }: { next: string; enabled: boolean }) {
  const [phone,setPhone] = useState('');
  const [code,setCode] = useState('');
  const [confirmation,setConfirmation] = useState<ConfirmationResult | null>(null);
  const [pending,setPending] = useState(false);
  const [error,setError] = useState('');
  const [seconds,setSeconds] = useState(0);
  const [sentTo,setSentTo] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);
  const available = enabled && isFirebasePhoneConfigured();
  useEffect(() => () => verifier.current?.clear(),[]);
  useEffect(() => {
    if (!seconds) return;
    const timeout = setTimeout(() => setSeconds(value => Math.max(0,value-1)),1000);
    return () => clearTimeout(timeout);
  },[seconds]);

  async function send() {
    setPending(true);setError('');
    try {
      const result = await beginAgentOtp(phone);
      if (!result.phone || result.error) { setError(result.error ?? 'Could not start sign-in.');return; }
      const auth = getAuth(firebaseApp());
      await setPersistence(auth,inMemoryPersistence);
      await signOut(auth);
      verifier.current?.clear();
      if (!container.current) throw new Error('Verification unavailable');
      verifier.current = new RecaptchaVerifier(auth,container.current,{ size:'normal' });
      const confirmationResult = await signInWithPhoneNumber(auth,result.phone,verifier.current);
      setConfirmation(confirmationResult);setSentTo(result.phone);setSeconds(30);setCode('');
    } catch (caught) { setError(friendly(caught));verifier.current?.clear();verifier.current=null; }
    finally { setPending(false); }
  }

  async function verify() {
    if (!confirmation || !/^\d{6}$/.test(code)) { setError('Enter the six-digit SMS code.');return; }
    setPending(true);setError('');
    try {
      const credentials = await confirmation.confirm(code);
      const result = await firebaseAgentLogin(await credentials.user.getIdToken(true));
      await signOut(getAuth(firebaseApp()));
      if (result.error) { setError(result.error);setConfirmation(null);return; }
      window.location.assign(next);
    } catch(caught) { setError(friendly(caught)); }
    finally { setPending(false); }
  }

  return <div className="space-y-5">
    <div><h1 className="text-[28px] font-semibold">Sales agent sign-in</h1><p className="mt-2 text-sm text-muted">Use the mobile number registered by your administrator. No password is needed.</p></div>
    {!available && <p role="status" className="rounded-lg bg-soft p-3 text-sm text-muted">SMS sign-in is being set up. Contact your administrator for access.</p>}
    <form className="space-y-4" onSubmit={event=>{event.preventDefault();if(confirmation)void verify();else void send();}}>
      {!confirmation ? <label className="block"><span className="mb-1.5 block text-sm font-semibold">Registered mobile number</span>
        <input value={phone} onChange={event=>setPhone(event.target.value)} type="tel" autoComplete="tel" placeholder="9876543210 or +91 9876543210" required maxLength={30} disabled={pending||!available} className="input" />
      </label> : <><p className="text-sm text-muted">Code sent to {sentTo}.</p><label className="block"><span className="mb-1.5 block text-sm font-semibold">SMS code</span>
        <input value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required disabled={pending} className="input" autoFocus />
      </label></>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={pending||!available} className="ui-button h-12 w-full rounded-xl bg-brand text-sm font-semibold text-white dark:text-bg disabled:opacity-60">{pending?'Please wait…':confirmation?'Verify and sign in':'Send OTP'}</button>
    </form>
    <div ref={container} />
    {confirmation && <div className="flex flex-wrap gap-4 text-sm">
      <button disabled={pending||seconds>0} onClick={()=>void send()} className="font-semibold text-brand disabled:opacity-50">{seconds?`Resend in ${seconds}s`:'Resend OTP'}</button>
      <button disabled={pending} onClick={async()=>{await resetLogin();setConfirmation(null);setCode('');setError('');verifier.current?.clear();verifier.current=null;}} className="text-muted">Change number</button>
    </div>}
    <p className="text-[11px] leading-5 text-muted">Google processes the phone number for SMS verification and abuse prevention.</p>
  </div>;
}
