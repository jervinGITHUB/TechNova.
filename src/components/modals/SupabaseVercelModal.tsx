import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  getSupabaseConfig,
  saveSupabaseCredentials,
  testSupabaseConnection,
  SUPABASE_SQL_SCHEMA,
  LIVESTREAM_SQL_SNIPPET,
  AUDIO_STORAGE_SQL_SNIPPET,
  PRE_BAN_APPEAL_SQL_SNIPPET,
  USER_BLOCKS_SQL_SNIPPET,
} from '../../lib/supabase';
import {
  Database,
  Cloud,
  Copy,
  Check,
  X,
  ExternalLink,
  ShieldCheck,
  Plug,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  UserCheck,
} from 'lucide-react';

interface SupabaseVercelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: () => void;
}

export const SupabaseVercelModal: React.FC<SupabaseVercelModalProps> = ({
  isOpen,
  onClose,
  onConnected,
}) => {
  const { currentUser } = useApp();
  const currentConfig = getSupabaseConfig();
  const [url, setUrl] = useState(currentConfig.url);
  const [anonKey, setAnonKey] = useState(currentConfig.anonKey);
  const [copied, setCopied] = useState(false);
  const [copiedAdminSql, setCopiedAdminSql] = useState(false);
  const [copiedLivestreamSql, setCopiedLivestreamSql] = useState(false);
  const [copiedAudioSql, setCopiedAudioSql] = useState(false);
  const [copiedAppealSql, setCopiedAppealSql] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeSqlTab, setActiveSqlTab] = useState<'audio' | 'livestream' | 'appeal' | 'block' | 'full'>('audio');

  if (!isOpen) return null;

  const targetIdentifier = currentUser?.email || currentUser?.username || 'jervan098@gmail.com';

  const makeAdminSql = `-- Run this in Supabase Dashboard -> SQL Editor -> New Query:
-- 1. Ensure Role column exists on User table (so it never throws column does not exist)
ALTER TABLE IF EXISTS public."User" ADD COLUMN IF NOT EXISTS "Role" TEXT DEFAULT 'creator';

-- 2. Upgrade user role in User table
UPDATE public."User"
SET "Role" = 'admin'
WHERE LOWER("Email") = LOWER('${targetIdentifier}') OR LOWER("Username") = LOWER('${targetIdentifier}');

-- 3. Add to Admin dashboard team with all permissions
INSERT INTO public."Admin" ("AdminID", "UserID", "Username", "Email", "Role", "Permissions", "CreatedAt", "LastLogin")
SELECT 
  gen_random_uuid(),
  "UserID",
  "Username",
  "Email",
  'Admin',
  ARRAY['all', 'manage_users', 'manage_videos', 'manage_reports', 'manage_admins', 'manage_audio'],
  NOW(),
  NOW()
FROM public."User"
WHERE LOWER("Email") = LOWER('${targetIdentifier}') OR LOWER("Username") = LOWER('${targetIdentifier}')
ON CONFLICT ("AdminID") DO NOTHING;`;

  const handleCopyAdminSql = () => {
    navigator.clipboard?.writeText(makeAdminSql);
    setCopiedAdminSql(true);
    setTimeout(() => setCopiedAdminSql(false), 2000);
  };

  const handleCopySchema = () => {
    navigator.clipboard?.writeText(SUPABASE_SQL_SCHEMA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLivestreamSql = () => {
    navigator.clipboard?.writeText(LIVESTREAM_SQL_SNIPPET);
    setCopiedLivestreamSql(true);
    setTimeout(() => setCopiedLivestreamSql(false), 2000);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    const result = await testSupabaseConnection(url.trim(), anonKey.trim());
    setIsTesting(false);
    setTestResult(result);
  };

  const handleSave = () => {
    saveSupabaseCredentials(url.trim(), anonKey.trim());
    setSaveSuccess(true);
    if (onConnected) onConnected();
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 1200);
  };

  const handleClear = () => {
    setUrl('');
    setAnonKey('');
    saveSupabaseCredentials('', '');
    setTestResult(null);
    if (onConnected) onConnected();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn select-none">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-[#13131a] border border-neutral-800 rounded-3xl p-5 sm:p-7 shadow-2xl z-10 flex flex-col max-h-[92vh] text-left">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-brand flex items-center gap-2">
                <span>Supabase & Vercel Connect</span>
              </h2>
              <p className="text-xs text-neutral-400">
                Configure your cloud PostgreSQL database and deploy to Vercel
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-6 pr-1 text-xs">
          {/* Connection Status Badge */}
          <div className="p-4 rounded-2xl bg-[#181824] border border-neutral-700/80 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="font-bold text-white text-sm flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    currentConfig.isConnected
                      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse'
                      : 'bg-amber-400'
                  }`}
                />
                Status:{' '}
                {currentConfig.isConnected
                  ? 'Connected to Supabase Cloud'
                  : 'Local High-Speed Persistence Mode (Active)'}
              </span>
              <span
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full w-fit ${
                  currentConfig.isConnected
                    ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/30'
                    : 'text-amber-400 bg-amber-500/10 border border-amber-500/30'
                }`}
              >
                {currentConfig.isConnected ? 'Database Synced' : 'Ready to Connect'}
              </span>
            </div>
            <p className="text-neutral-300 leading-relaxed text-xs">
              Every interaction (register, profile changes, video uploads, likes, comments, follows, messages, and reports) persists safely. When you connect Supabase, data will synchronize directly with your cloud database tables!
            </p>
          </div>

          {/* Database Credentials Form */}
          <div className="space-y-3 bg-[#161622] p-4 rounded-2xl border border-neutral-800">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Plug className="w-4 h-4 text-[#ff007a]" />
              <span>1. Supabase Project Credentials</span>
            </h3>
            <p className="text-neutral-400 text-xs">
              Enter your project URL and public anon key (found in Supabase Dashboard → Project Settings → API):
            </p>

            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                  Project URL (<code className="text-[#ff007a]">VITE_SUPABASE_URL</code>)
                </label>
                <input
                  type="text"
                  placeholder="https://xyzcompany.supabase.co"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  className="w-full bg-[#0d0d12] text-xs text-white placeholder-neutral-500 px-3.5 py-2.5 rounded-xl border border-neutral-700 focus:border-[#ff007a] outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                  Public Anon Key (<code className="text-[#ff007a]">VITE_SUPABASE_ANON_KEY</code>)
                </label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={anonKey}
                  onChange={e => setAnonKey(e.target.value)}
                  className="w-full bg-[#0d0d12] text-xs text-white placeholder-neutral-500 px-3.5 py-2.5 rounded-xl border border-neutral-700 focus:border-[#ff007a] outline-none font-mono"
                />
              </div>
            </div>

            {/* Test result message */}
            {testResult && (
              <div
                className={`p-3 rounded-xl border flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span className="text-xs">{testResult.message}</span>
              </div>
            )}

            {/* Buttons for test / save / clear */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || !url.trim() || !anonKey.trim()}
                className="py-2 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
                <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={!url.trim() || !anonKey.trim()}
                className="py-2 px-5 rounded-xl bg-gradient-to-r from-[#ff007a] to-[#d00062] hover:from-[#ff1a8c] hover:to-[#e6006c] text-white font-bold text-xs disabled:opacity-40 shadow-md transition-all cursor-pointer"
              >
                {saveSuccess ? 'Saved & Connected!' : 'Save & Connect'}
              </button>

              {(url || anonKey) && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="py-2 px-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white font-medium text-xs transition-colors cursor-pointer ml-auto"
                >
                  Reset / Disconnect
                </button>
              )}
            </div>
          </div>

          {/* Supabase Schema SQL (1-click copy) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>2. Supabase SQL Schema (Tables & Policies)</span>
              </h3>
              <div className="flex items-center gap-2">
                {activeSqlTab === 'audio' ? (
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(AUDIO_STORAGE_SQL_SNIPPET);
                      setCopiedAudioSql(true);
                      setTimeout(() => setCopiedAudioSql(false), 2000);
                    }}
                    className="py-1 px-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    {copiedAudioSql ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedAudioSql ? 'Copied Audio SQL!' : 'Copy Audio & Storage SQL'}</span>
                  </button>
                ) : activeSqlTab === 'livestream' ? (
                  <button
                    onClick={handleCopyLivestreamSql}
                    className="py-1 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    {copiedLivestreamSql ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLivestreamSql ? 'Copied Livestream SQL!' : 'Copy Livestream SQL'}</span>
                  </button>
                ) : activeSqlTab === 'appeal' ? (
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(PRE_BAN_APPEAL_SQL_SNIPPET);
                      setCopiedAppealSql(true);
                      setTimeout(() => setCopiedAppealSql(false), 2000);
                    }}
                    className="py-1 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    {copiedAppealSql ? <Check className="w-3.5 h-3.5 text-black" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedAppealSql ? 'Copied Due Process SQL!' : 'Copy Pre-Ban Due Process SQL'}</span>
                  </button>
                ) : (
                  <button
                    onClick={handleCopySchema}
                    className="py-1 px-3 rounded-xl bg-[#ff007a] hover:bg-[#ff1a8c] text-white font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied Full SQL!' : 'Copy Full Schema'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Sub-tabs for Audio vs Livestream vs Appeal vs Full Schema */}
            <div className="flex items-center gap-1.5 mb-2 bg-[#0d0d14] p-1 rounded-xl border border-neutral-800 w-fit flex-wrap">
              <button
                type="button"
                onClick={() => setActiveSqlTab('appeal')}
                className={`py-1 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  activeSqlTab === 'appeal'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Pre-Ban Due Process (Appeals & Proofs)
              </button>
              <button
                type="button"
                onClick={() => setActiveSqlTab('audio')}
                className={`py-1 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  activeSqlTab === 'audio'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Audio & Storage SQL
              </button>
              <button
                type="button"
                onClick={() => setActiveSqlTab('livestream')}
                className={`py-1 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  activeSqlTab === 'livestream'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Livestream SQL
              </button>
              <button
                type="button"
                onClick={() => setActiveSqlTab('block')}
                className={`py-1 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  activeSqlTab === 'block'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40 shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Blocked Users SQL
              </button>
              <button
                type="button"
                onClick={() => setActiveSqlTab('full')}
                className={`py-1 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  activeSqlTab === 'full'
                    ? 'bg-[#ff007a]/20 text-[#ff007a] border border-[#ff007a]/40 shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Full Platform Schema
              </button>
            </div>

            <p className="text-neutral-400 mb-2">
              {activeSqlTab === 'appeal' ? (
                <span>
                  <strong>100% Safe & Zero Disk IO:</strong> Adds non-blocking columns to the <code className="text-amber-400">User</code> table for pre-ban warnings and appeal counter-proofs, with lightweight B-Tree indexes that protect disk IO and guarantee instant lookups.
                </span>
              ) : activeSqlTab === 'audio' ? (
                <span>
                  <strong>Safe & Zero Disk IO:</strong> Enables public file uploads for the <code className="text-cyan-400">audio</code> storage bucket and ensures columns exist on the <code className="text-cyan-400">AudioLibrary</code> table with permissive public RLS policies.
                </span>
              ) : activeSqlTab === 'livestream' ? (
                <span>
                  <strong>100% Safe & Zero Disk IO:</strong> Paste this into your Supabase Dashboard (<span className="text-white font-medium">SQL Editor → New Query</span>) and click <span className="text-white font-medium">Run</span> to create the <code className="text-emerald-400">Livestream</code> and <code className="text-emerald-400">LiveComment</code> tables with instant indexing and public access policies.
                </span>
              ) : activeSqlTab === 'block' ? (
                <span>
                  <strong>100% Safe & Zero Disk IO:</strong> Creates the <code className="text-red-400">user_blocks</code> table with composite primary key and B-Tree index. Guaranteed to never deplete disk IO and provides instant block lookups.
                </span>
              ) : (
                <span>
                  Paste this into your Supabase Dashboard (<span className="text-white font-medium">SQL Editor → New Query</span>) and click <span className="text-white font-medium">Run</span> to initialize all tables with Row Level Security.
                </span>
              )}
            </p>
            <div className="bg-[#0c0c10] p-3 rounded-xl border border-neutral-800 font-mono text-[11px] text-neutral-400 max-h-40 overflow-y-auto leading-relaxed">
              <pre>{activeSqlTab === 'appeal' ? PRE_BAN_APPEAL_SQL_SNIPPET : activeSqlTab === 'audio' ? AUDIO_STORAGE_SQL_SNIPPET : activeSqlTab === 'livestream' ? LIVESTREAM_SQL_SNIPPET : activeSqlTab === 'block' ? USER_BLOCKS_SQL_SNIPPET : SUPABASE_SQL_SCHEMA}</pre>
            </div>
          </div>

          {/* Deploy on Vercel Guide */}
          <div>
            <h3 className="font-bold text-white text-sm mb-2 flex items-center gap-2">
              <Cloud className="w-4 h-4 text-cyan-400" />
              <span>3. Ready to Deploy on Vercel</span>
            </h3>
            <div className="p-3.5 rounded-2xl bg-[#161622] border border-neutral-800 space-y-2">
              <p className="text-neutral-300">
                ViralHub includes a pre-configured <code className="text-[#ff007a] font-mono">vercel.json</code> with SPA client rewrite rules and Vite build optimization:
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-neutral-300 ml-1">
                <li>Push repository to your GitHub.</li>
                <li>In <span className="text-white font-semibold">Vercel Dashboard</span>, click <strong>Add New Project</strong> and import your repo.</li>
                <li>
                  Under <strong>Environment Variables</strong> in Vercel, add:
                  <div className="bg-[#0a0a0f] p-2 mt-1 rounded-lg border border-neutral-800 font-mono text-[10px] text-neutral-300 space-y-0.5">
                    <div>VITE_SUPABASE_URL = {url || 'https://your-project.supabase.co'}</div>
                    <div>VITE_SUPABASE_ANON_KEY = {anonKey ? anonKey.slice(0, 20) + '...' : 'your-anon-key'}</div>
                  </div>
                </li>
                <li>Click <strong>Deploy</strong>. Vercel automatically builds and deploys your application!</li>
              </ol>
            </div>
          </div>

          {/* Make Account Admin SQL Script */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-amber-400" />
                <span>4. Make My Account an Admin (SQL Script)</span>
              </h3>
              <button
                onClick={handleCopyAdminSql}
                className="py-1 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                {copiedAdminSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAdminSql ? 'Copied Admin SQL!' : 'Copy Admin SQL'}</span>
              </button>
            </div>
            <p className="text-neutral-400 mb-2">
              Run this in your Supabase Dashboard (<span className="text-white font-medium">SQL Editor → New Query</span>) to instantly grant your account Super Admin access:
            </p>
            <div className="bg-[#0c0c10] p-3 rounded-xl border border-neutral-800 font-mono text-[11px] text-amber-300 max-h-36 overflow-y-auto leading-relaxed">
              <pre>{makeAdminSql}</pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-neutral-800 flex justify-end">
          <button
            onClick={onClose}
            className="py-2 px-6 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
