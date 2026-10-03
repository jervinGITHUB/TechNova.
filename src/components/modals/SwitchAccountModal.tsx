import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { User } from '../../types';
import { Avatar } from '../common/Avatar';
import { ViralHubLogo } from '../common/ViralHubLogo';
import {
  X,
  UserCheck,
  UserPlus,
  LogOut,
  ArrowRightLeft,
  Shield,
  Check,
  Plus,
  Trash2,
} from 'lucide-react';

interface SwitchAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SwitchAccountModal: React.FC<SwitchAccountModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    currentUser,
    users,
    savedAccounts,
    removeSavedAccount,
    admins,
    quickLoginAs,
    logout,
    setAuthView,
  } = useApp();

  if (!isOpen) return null;

  // Strictly ONLY accounts logged-in on THIS device (stored in savedAccounts / currentUser)
  const displayAccounts: User[] = (() => {
    const map = new Map<string, User>();
    const emailToId = new Map<string, string>();

    // 1. Saved accounts that actually logged in on this device
    for (const a of savedAccounts) {
      if (!a || !a.id) continue;
      const emailKey = a.email ? a.email.trim().toLowerCase() : null;
      map.set(a.id, a);
      if (emailKey) emailToId.set(emailKey, a.id);
    }

    // 2. Ensure current active user is also present
    if (currentUser && currentUser.id) {
      const emailKey = currentUser.email ? currentUser.email.trim().toLowerCase() : null;
      if (emailKey && emailToId.has(emailKey)) {
        const existingId = emailToId.get(emailKey)!;
        map.set(existingId, currentUser);
      } else {
        map.set(currentUser.id, currentUser);
      }
    }

    return Array.from(map.values());
  })();

  const handleSwitchTo = (userId: string) => {
    quickLoginAs(userId);
    onClose();
  };

  const handleAddNewAccount = () => {
    onClose();
    // Open auth page in login or register mode
    setAuthView('login');
    logout();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-md bg-[#13131c] border border-neutral-800 rounded-3xl p-6 shadow-2xl z-10 text-left space-y-5">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-neutral-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#ff007a]/15 text-[#ff007a]">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-brand">Switch Account</h3>
              <p className="text-xs text-neutral-400">Switch between profiles on this device</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Active Account Card */}
        {currentUser && (
          <div className="p-3.5 rounded-2xl bg-[#1a1a27] border border-[#ff007a]/40 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar
                src={currentUser.avatar}
                alt={currentUser.displayName || currentUser.username}
                size="md"
                className="border-2 border-[#ff007a]"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white truncate">
                    {currentUser.displayName || currentUser.username}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-[#ff007a]/20 text-[#ff007a] text-[10px] font-bold">
                    Active
                  </span>
                </div>
                <div className="text-[11px] text-neutral-400 truncate">
                  @{currentUser.username} {currentUser.email ? `· ${currentUser.email}` : ''}
                </div>
              </div>
            </div>
            <Check className="w-5 h-5 text-[#ff007a] shrink-0" />
          </div>
        )}

        {/* Available Accounts to Switch to */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 block px-1">
            Available Accounts ({displayAccounts.length})
          </label>
          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
            {displayAccounts.map(u => {
              const isCurrent = currentUser?.id === u.id;
              const roleLower = String(u.role || '').toLowerCase();
              const isAdminAccount = roleLower === 'admin' || roleLower === 'super admin' || roleLower === 'administrator';

              return (
                <div
                  key={u.id}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all text-left ${
                    isCurrent
                      ? 'bg-[#181824]/60 border-neutral-800 opacity-80'
                      : 'bg-[#181824] hover:bg-[#202030] border-neutral-800/80 hover:border-neutral-700'
                  }`}
                >
                  <div
                    onClick={() => !isCurrent && handleSwitchTo(u.id)}
                    className={`flex items-center gap-3 min-w-0 flex-1 ${!isCurrent ? 'cursor-pointer' : ''}`}
                  >
                    <Avatar
                      src={u.avatar}
                      alt={u.displayName || u.username}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">
                          {u.displayName || u.username}
                        </span>
                        {isAdminAccount && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-extrabold uppercase tracking-wider shrink-0">
                            Admin
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-400 truncate">
                        @{u.username} {u.email ? `· ${u.email}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {isCurrent ? (
                      <span className="text-[11px] text-neutral-500 font-medium">Active</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSwitchTo(u.id)}
                          className="text-xs font-bold text-[#ff007a] hover:underline px-2 py-1 rounded-lg hover:bg-[#ff007a]/10 cursor-pointer"
                        >
                          Switch →
                        </button>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            removeSavedAccount(u.id);
                          }}
                          className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition-colors cursor-pointer"
                          title="Remove from this device"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 border-t border-neutral-800/80 space-y-2">
          {/* Add / Sign in to another account */}
          <button
            onClick={handleAddNewAccount}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-cyan-400" />
            <span>Add or Sign in to Another Account</span>
          </button>

          {/* Log Out Current Account */}
          <button
            onClick={() => {
              onClose();
              logout();
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-xs transition-colors cursor-pointer border border-red-500/20"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out Current Account</span>
          </button>
        </div>
      </div>
    </div>
  );
};
