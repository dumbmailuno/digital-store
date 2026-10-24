"use client";

import { createContext, useContext } from "react";

const Ctx = createContext(false);

/** Wraps the admin area. true = the developer's read-only support view. */
export function ReadOnlyProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useReadOnly = () => useContext(Ctx);

/**
 * Put around anything that changes data. In the read-only view every control inside is disabled
 * (links still work). This is for clarity only: the real enforcement is in the API routes and
 * the database policies, which refuse the developer's writes whatever the browser shows.
 */
export function Guard({ children }: { children: React.ReactNode }) {
  const ro = useReadOnly();
  return <fieldset disabled={ro} className="m-0 min-w-0 border-0 p-0 disabled:opacity-70">{children}</fieldset>;
}
