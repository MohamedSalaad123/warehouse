import { Globe, Lock, ShieldCheck, Warehouse as WarehouseIcon } from 'lucide-react';
import React, { useState } from 'react';
import { t } from '../i18n/translations';
import { apiRequest, setAuthToken } from '../lib/api';
import type { AuthUser, LanguageCode } from '../types/wms';

interface AuthScreenProps {
  initialized: boolean;
  companyName: string;
  companyLogo?: string;
  lang: LanguageCode;
  onChangeLang: (lang: LanguageCode) => void;
  onAuthenticated: (user: AuthUser) => void;
}

export function AuthScreen({
  initialized,
  companyName,
  companyLogo,
  lang,
  onChangeLang,
  onAuthenticated,
}: AuthScreenProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  // Bootstrap fields
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [imgFailed, setImgFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!initialized) {
        const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/bootstrap', {
          method: 'POST',
          body: {
            fullName,
            username,
            email,
            password,
            companyName: companyName || 'Khayre Warehouse Management System',
            language: lang,
          },
        });
        setAuthToken(res.token);
        onAuthenticated(res.user);
      } else {
        const res = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/login', {
          method: 'POST',
          body: { identifier, password },
        });
        setAuthToken(res.token);
        onAuthenticated(res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-stretch">
      {/* Left visual architectural panel */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#0F1E36] text-white overflow-hidden flex-col justify-between p-12">
        {!imgFailed ? (
          <img
            src="/src/assets/images/khayre_logistics_facility_1795764682929.jpg"
            alt="Khayre enterprise warehouse interior"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover opacity-35"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0F1E36] via-[#0F1E36]/75 to-[#0F1E36]/60" />

        <div className="relative z-10 flex items-center gap-3">
          {!logoFailed ? (
            <img
              src={companyLogo || '/src/assets/images/khayre_wms_emblem_1795764682289.jpg'}
              alt="Khayre Warehouse Management System"
              referrerPolicy="no-referrer"
              onError={() => setLogoFailed(true)}
              className="w-10 h-10 rounded-md object-cover bg-white p-0.5"
            />
          ) : (
            <div className="w-10 h-10 rounded-md bg-[#1E4E79] flex items-center justify-center">
              <WarehouseIcon className="w-5 h-5 text-white" />
            </div>
          )}
          <span className="font-display text-lg font-bold tracking-tight text-white">
            {companyName || 'Khayre Warehouse Management System'}
          </span>
        </div>

        <div className="relative z-10 max-w-lg">
          <h1 className="font-display text-3xl font-bold leading-tight text-white [text-wrap:balance]">
            {lang === 'so'
              ? 'Nidaamka Dhexe ee Maamulka Bakhaarada & Kaydka'
              : 'Centralized Multi-Warehouse Operations & Inventory Control'}
          </h1>
          <p className="mt-4 text-sm text-slate-300 leading-relaxed">
            {lang === 'so'
              ? 'Maamul bakhaaro aan xadidnayn, la soco dhaqdhaqaaqa alaabta waqtiga dhabta ah, xaqiiji wareejinta bakhaarada, oo hel qiimeynta saxda ah ee kaydka shirkadda.'
              : 'Operate unlimited regional warehouses from one centralized platform with Moving Weighted Average costing, verified inter-warehouse transfers, and immutable stock ledgers.'}
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3 text-xs text-slate-300">
          <span>{lang === 'so' ? 'Bakhaaro Badan' : 'Unlimited Warehouses'}</span>
          <span aria-hidden="true">·</span>
          <span>{lang === 'so' ? 'Xakameynta Doorka' : 'Role-Based Access'}</span>
          <span aria-hidden="true">·</span>
          <span>{lang === 'so' ? 'Diiwaan Joogto Ah' : 'Permanent Stock Ledger'}</span>
        </div>
      </div>

      {/* Right authentication card */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-12 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 lg:hidden">
            <WarehouseIcon className="w-6 h-6 text-[#1E4E79]" />
            <span className="font-display font-bold text-slate-900">{companyName || 'Khayre WMS'}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Globe className="w-4 h-4 text-slate-500" />
            <button
              type="button"
              onClick={() => onChangeLang('so')}
              className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
                lang === 'so'
                  ? 'bg-[#1E4E79] text-white border-[#1E4E79]'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              Soomaali
            </button>
            <button
              type="button"
              onClick={() => onChangeLang('en')}
              className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
                lang === 'en'
                  ? 'bg-[#1E4E79] text-white border-[#1E4E79]'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              English
            </button>
          </div>
        </div>

        <div className="w-full max-w-md mx-auto my-auto py-8">
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#1E4E79] mb-2">
              {initialized ? <Lock className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
              <span>{initialized ? 'Khayre WMS' : lang === 'so' ? 'Bilowga Nidaamka' : 'First-Run Setup'}</span>
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-900">
              {initialized ? t(lang, 'signIn') : t(lang, 'setupAdminTitle')}
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              {initialized ? t(lang, 'loginSubtitle') : t(lang, 'setupAdminSubtitle')}
            </p>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!initialized ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {t(lang, 'fullName')}
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Mohamed Khayre"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E4E79]/30 focus:border-[#1E4E79]"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t(lang, 'username')}
                    </label>
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E4E79]/30 focus:border-[#1E4E79]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t(lang, 'email')}
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@khayre.com"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E4E79]/30 focus:border-[#1E4E79]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {t(lang, 'password')}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E4E79]/30 focus:border-[#1E4E79]"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {t(lang, 'usernameOrEmail')}
                  </label>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="admin@khayre.com"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E4E79]/30 focus:border-[#1E4E79]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {t(lang, 'password')}
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1E4E79]/30 focus:border-[#1E4E79]"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-[#1E4E79] hover:bg-[#163A5C] rounded-md transition-colors disabled:opacity-60"
            >
              {loading
                ? t(lang, 'loading')
                : initialized
                ? t(lang, 'signIn')
                : t(lang, 'createAdminAccount')}
            </button>
          </form>
        </div>

        <p className="text-xs text-slate-400 text-center">
          Khayre Warehouse Management System · Enterprise Inventory & Logistics
        </p>
      </div>
    </div>
  );
}
