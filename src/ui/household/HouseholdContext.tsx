import React, { createContext, useContext } from "react";

export interface HouseholdContextType {
  name: string;
}

export const HouseholdContext = createContext<HouseholdContextType | undefined>(undefined);

export function HouseholdProvider({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <HouseholdContext.Provider value={{ name }}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  const context = useContext(HouseholdContext);
  if (context === undefined) {
    throw new Error("useHousehold must be used within a HouseholdProvider");
  }
  return context;
}
