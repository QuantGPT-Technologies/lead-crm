'use client';

import { useState } from 'react';
import { AgentPhoneLogin } from './agent-phone-login';
import { LoginFlow } from './login-flow';

export function LoginPortal({ next, useOtp, agentEnabled, notice }: { next: string; useOtp: boolean; agentEnabled: boolean; notice?: string }) {
  const [mode,setMode] = useState<'staff'|'agent'>('staff');
  return <div className="mx-auto w-full max-w-md">
    <div className="mb-8 flex rounded-xl bg-soft p-1" role="group" aria-label="Sign-in method">
      <button type="button" aria-pressed={mode==='staff'} onClick={()=>setMode('staff')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${mode==='staff'?'bg-card shadow-sm':'text-muted'}`}>Admin / manager</button>
      <button type="button" aria-pressed={mode==='agent'} onClick={()=>setMode('agent')} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${mode==='agent'?'bg-card shadow-sm':'text-muted'}`}>Sales agent</button>
    </div>
    {mode==='agent'?<AgentPhoneLogin next={next} enabled={agentEnabled} />:<LoginFlow useGlobal={false} useOtp={useOtp} initialStep="user" next={next} notice={notice} />}
  </div>;
}
