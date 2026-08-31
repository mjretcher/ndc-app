"use client";

import { useState, type InputHTMLAttributes } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Classes for the outer wrapper — put grid/width placement here (e.g. "md:col-span-3", "!w-48"). */
  wrapperClassName?: string;
};

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a13.16 13.16 0 0 1-3.19 4.06M6.11 6.11A13.16 13.16 0 0 0 1 11s4 7 11 7a9.16 9.16 0 0 0 5.89-2.11M1 1l22 22" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    </svg>
  );
}

/**
 * Drop-in replacement for <input type="password">, with a show/hide toggle.
 * Width and grid-placement classes go on `wrapperClassName`; `className`
 * (defaults to the app's "input" style) controls the field's own look —
 * the .input class is width:100% already, so it fills whatever the wrapper
 * gives it and the visible layout matches a plain password input exactly.
 */
export function PasswordInput({ wrapperClassName, className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={`relative ${wrapperClassName ?? ""}`}>
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`${className ?? "input"} pr-9`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-mute hover:text-navy"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
