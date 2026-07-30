import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

import { defaultFavoriteSlugs } from "./catalog";

type CalculatorCatalogContextValue = {
  favoriteSlugs: string[];
  isFavorite: (slug: string) => boolean;
  toggleFavorite: (slug: string) => void;
};

const CalculatorCatalogContext = createContext<CalculatorCatalogContextValue | null>(
  null
);

export function CalculatorCatalogProvider({ children }: React.PropsWithChildren) {
  const [favoriteSlugs, setFavoriteSlugs] = useState(defaultFavoriteSlugs);

  const isFavorite = useCallback(
    (slug: string) => favoriteSlugs.includes(slug),
    [favoriteSlugs]
  );

  const toggleFavorite = useCallback((slug: string) => {
    setFavoriteSlugs((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug]
    );
  }, []);

  const value = useMemo(
    () => ({
      favoriteSlugs,
      isFavorite,
      toggleFavorite,
    }),
    [favoriteSlugs, isFavorite, toggleFavorite]
  );

  return (
    <CalculatorCatalogContext.Provider value={value}>
      {children}
    </CalculatorCatalogContext.Provider>
  );
}

export function useCalculatorCatalog(): CalculatorCatalogContextValue {
  const context = useContext(CalculatorCatalogContext);

  if (!context) {
    throw new Error(
      "useCalculatorCatalog must be used inside CalculatorCatalogProvider."
    );
  }

  return context;
}