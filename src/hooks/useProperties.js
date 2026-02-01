import { useEffect, useState } from "react";

export function useProperties() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("http://localhost:8000/properties");
        const data = await res.json();
        setProperties(data);
      } catch (err) {
        console.error("Failed to load properties", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return { properties, loading };
}
