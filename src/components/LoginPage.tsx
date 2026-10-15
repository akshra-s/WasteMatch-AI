import React, { useState } from 'react';
import { ArrowRight, Factory, Recycle, Sparkles, CheckCircle2, Shield } from 'lucide-react';
import { Logo } from './Logo';

interface LoginPageProps {
  onLoginSuccess: (user: { email: string; companyName: string; location: string; token: string }) => void;
  onBackToLanding: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  onBackToLanding
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('operations@ecocement.in');
  const [password, setPassword] = useState('password123');
  const [companyName, setCompanyName] = useState('EcoCement Industries');
  const [location, setLocation] = useState('Gurgaon, Haryana');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    const endpoint = mode === 'signin' ? '/api/auth/login' : '/api/auth/register';
    const payload = mode === 'signin'
      ? { email, password }
      : { email, password, companyName, location };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Authentication failed. Please check credentials.');
      }

      // Store persistent session token
      if (data.token) {
        localStorage.setItem('wastematch_token', data.token);
      }

      onLoginSuccess({
        email: data.user.email,
        companyName: data.user.companyName,
        location: data.user.location,
        token: data.token
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Authentication error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoSignIn = async () => {
    setEmail('operations@ecocement.in');
    setPassword('password123');
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'operations@ecocement.in', password: 'password123' })
      });
      const data = await res.json();
      if (data.ok && data.token) {
        localStorage.setItem('wastematch_token', data.token);
        onLoginSuccess({
          email: data.user.email,
          companyName: data.user.companyName,
          location: data.user.location,
          token: data.token
        });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to connect');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full min-h-[calc(100vh-80px)] flex items-stretch bg-white" id="login-screen-root">
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 min-h-[calc(100vh-80px)]">
        
        {/* LEFT SIDE (Deep Forest Green) */}
        <div className="hidden lg:flex lg:col-span-6 bg-[#0B3D2E] text-white p-12 xl:p-16 flex-col justify-between relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute top-10 right-10 w-80 h-80 bg-[#35A66F]/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-10 left-10 w-60 h-60 bg-[#146B4A]/30 rounded-full blur-2xl pointer-events-none" />

          {/* Top Brand */}
          <div className="relative z-10">
            <button
              onClick={onBackToLanding}
              className="inline-block text-left cursor-pointer focus:outline-hidden"
              id="login-brand-back-btn"
            >
              <Logo variant="light" size="md" />
            </button>
          </div>

          {/* Center Content & Visual Flow */}
          <div className="relative z-10 my-auto py-8">
            <h1 className="font-heading font-extrabold text-4xl xl:text-5xl text-white tracking-tight leading-tight mb-4">
              Give waste <br />
              <span className="text-[#35A66F]">a second life.</span>
            </h1>
            <p className="text-[#C8EBD5] text-base leading-relaxed max-w-md mb-10">
              AI-powered resource matching for modern industry. Connecting generators with secondary processors.
            </p>

            {/* Visual Flow: FACTORY -> WASTE -> MATCH -> RESOURCE */}
            <div className="bg-[#146B4A]/40 rounded-2xl p-6 border border-[#35A66F]/30 backdrop-blur-xs max-w-lg">
              <div className="text-[11px] font-extrabold tracking-wider uppercase text-[#C8EBD5] mb-4">
                Circular Value Architecture
              </div>

              <div className="grid grid-cols-4 gap-2 items-center text-center">
                {/* 1. FACTORY */}
                <div className="flex flex-col items-center">
                  <div className="w-11 h-11 rounded-xl bg-[#0B3D2E] border border-[#35A66F]/40 flex items-center justify-center text-[#EFF9F2] mb-2 shadow-xs">
                    <Factory className="w-5 h-5" />
                  </div>
                  <span className="font-heading font-bold text-xs text-white">FACTORY</span>
                  <span className="text-[9px] text-[#C8EBD5]">Generation</span>
                </div>

                {/* Arrow */}
                <div className="flex justify-center text-[#35A66F]">
                  <ArrowRight className="w-4 h-4" />
                </div>

                {/* 2. WASTE */}
                <div className="flex flex-col items-center">
                  <div className="w-11 h-11 rounded-xl bg-[#0B3D2E] border border-[#35A66F]/40 flex items-center justify-center text-[#EFF9F2] mb-2 shadow-xs">
                    <Recycle className="w-5 h-5" />
                  </div>
                  <span className="font-heading font-bold text-xs text-white">WASTE</span>
                  <span className="text-[9px] text-[#C8EBD5]">Specification</span>
                </div>

                {/* Arrow */}
                <div className="flex justify-center text-[#35A66F]">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 items-center text-center mt-4 pt-4 border-t border-[#35A66F]/20">
                <div className="col-span-2 flex items-center justify-center gap-2 bg-[#0B3D2E]/70 p-2 rounded-xl border border-[#35A66F]/30">
                  <Sparkles className="w-4 h-4 text-[#35A66F]" />
                  <span className="font-heading font-bold text-xs text-white">AI MATCH</span>
                </div>

                <div className="flex justify-center text-[#35A66F]">
                  <ArrowRight className="w-4 h-4" />
                </div>

                <div className="flex flex-col items-center">
                  <div className="w-11 h-11 rounded-xl bg-[#238B5A] text-white flex items-center justify-center mb-1 shadow-md shadow-[#0B3D2E]">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <span className="font-heading font-bold text-xs text-white">RESOURCE</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Security Note */}
          <div className="relative z-10 flex items-center gap-2 text-xs text-[#C8EBD5]/80">
            <Shield className="w-4 h-4 text-[#35A66F]" />
            <span>Industrial grade encryption & verified corporate identities</span>
          </div>
        </div>

        {/* RIGHT SIDE (Clean White Form) */}
        <div className="lg:col-span-6 p-8 sm:p-12 lg:p-16 flex flex-col justify-center max-w-md mx-auto w-full">
          
          <div className="mb-6">
            <div className="flex items-center gap-2 p-1 bg-[#EFF9F2] rounded-xl border border-[#D9F2E3] mb-5 w-fit">
              <button
                type="button"
                onClick={() => { setMode('signin'); setErrorMsg(null); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  mode === 'signin' ? 'bg-[#0B3D2E] text-white shadow-xs' : 'text-[#4A6054] hover:text-[#0B3D2E]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('signup'); setErrorMsg(null); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  mode === 'signup' ? 'bg-[#0B3D2E] text-white shadow-xs' : 'text-[#4A6054] hover:text-[#0B3D2E]'
                }`}
              >
                Register Company
              </button>
            </div>

            <h2 className="font-heading font-extrabold text-3xl text-[#0B3D2E] tracking-tight">
              {mode === 'signin' ? 'Welcome to WasteMatch' : 'Create Organization Account'}
            </h2>
            <p className="text-sm text-[#4A6054] mt-1.5 font-medium">
              {mode === 'signin'
                ? 'Sign in to access your industrial waste matching workspace.'
                : 'Join verified regional industrial circularity networks.'}
            </p>
          </div>

          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
              <div className="font-medium">{errorMsg}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" id="login-form">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0B3D2E] mb-1.5" htmlFor="company-name">
                    Company Name
                  </label>
                  <input
                    id="company-name"
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Tata Steel Processing"
                    required
                    className="w-full px-4 py-3 rounded-xl border border-[#D9F2E3] bg-[#F8FBF9] text-[#0B3D2E] text-sm focus:outline-hidden focus:border-[#238B5A] focus:ring-2 focus:ring-[#EFF9F2] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0B3D2E] mb-1.5" htmlFor="facility-location">
                    Industrial Facility Location
                  </label>
                  <input
                    id="facility-location"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Pune, Maharashtra"
                    required
                    className="w-full px-4 py-3 rounded-xl border border-[#D9F2E3] bg-[#F8FBF9] text-[#0B3D2E] text-sm focus:outline-hidden focus:border-[#238B5A] focus:ring-2 focus:ring-[#EFF9F2] transition-all"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#0B3D2E] mb-1.5" htmlFor="work-email">
                Work Email
              </label>
              <input
                id="work-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="company@email.com"
                required
                className="w-full px-4 py-3 rounded-xl border border-[#D9F2E3] bg-[#F8FBF9] text-[#0B3D2E] text-sm focus:outline-hidden focus:border-[#238B5A] focus:ring-2 focus:ring-[#EFF9F2] transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#0B3D2E]" htmlFor="password">
                  Password
                </label>
                {mode === 'signin' && (
                  <span className="text-xs text-[#238B5A] font-semibold">
                    Demo: password123
                  </span>
                )}
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                required
                className="w-full px-4 py-3 rounded-xl border border-[#D9F2E3] bg-[#F8FBF9] text-[#0B3D2E] text-sm focus:outline-hidden focus:border-[#238B5A] focus:ring-2 focus:ring-[#EFF9F2] transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3.5 px-4 rounded-xl bg-[#0B3D2E] hover:bg-[#146B4A] text-white font-heading font-bold text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-70"
              id="submit-signin-btn"
            >
              {isLoading ? (
                <span>Processing...</span>
              ) : (
                <>
                  <span>{mode === 'signin' ? 'Sign in to Workspace' : 'Create Company Account'}</span>
                  <ArrowRight className="w-4 h-4 text-[#35A66F]" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Login Option */}
          <div className="mt-4 pt-4 border-t border-[#E8F3ED]">
            <button
              type="button"
              onClick={handleDemoSignIn}
              disabled={isLoading}
              className="w-full py-2.5 px-3 rounded-xl border border-[#238B5A]/30 bg-[#EFF9F2] hover:bg-[#D9F2E3] text-[#0B3D2E] text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[#238B5A]" />
              <span>Sign in with Demo Account (EcoCement Industries)</span>
            </button>
          </div>

          {/* Toggle link */}
          <p className="text-center text-xs text-[#60756A] mt-5">
            {mode === 'signin' ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setErrorMsg(null); }}
              className="text-[#238B5A] font-bold hover:underline cursor-pointer"
            >
              {mode === 'signin' ? 'Register your company' : 'Sign in'}
            </button>
          </p>

          <div className="mt-8 pt-6 border-t border-[#E8F3ED] text-center">
            <button
              onClick={onBackToLanding}
              className="text-xs font-semibold text-[#60756A] hover:text-[#0B3D2E] transition-colors"
            >
              ← Back to public homepage
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
