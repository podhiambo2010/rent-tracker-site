// src/hooks/useApiBase.js
import { useEffect, useState } from "react";
import {
  getApiBase,
  getStoredApiBase,
  setStoredApiBase,
} from "../api/apiClient";

export function useApiBase() {
  const [effectiveBase, setEffectiveBase] = useState(getApiBase);
  const [override, setOverride] = useState(getStoredApiBase);

  useEffect(() => {
    // Initialize values from storage and defaults
    const stored = getStoredApiBase();
    const base = getApiBase();

    setOverride(stored);
    setEffectiveBase(stored || base);
  }, []);

  function updateApiBase(newBase) {
    // Persist the new base
    setStoredApiBase(newBase || "");

    // Update local state
    setOverride(newBase || null);
    setEffectiveBase(newBase || null);

    // ❌ Removed reload to prevent infinite refresh loop
    // The app will now update smoothly without disappearing
  }

  return {
    effectiveBase,
    override,
    updateApiBase,
  };
}
