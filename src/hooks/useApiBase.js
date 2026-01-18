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
    setEffectiveBase(getApiBase());
    setOverride(getStoredApiBase());
  }, []);

  function updateApiBase(newBase) {
    setStoredApiBase(newBase || "");
    setOverride(newBase || null);
    setEffectiveBase(getApiBase());
    // Hard reload so all hooks pick up new base
    window.location.reload();
  }

  return {
    effectiveBase,
    override,
    updateApiBase,
  };
}
