import React, { createContext, useContext, useState, useMemo } from 'react';

interface TitleContextType {
  title: string | null;
  setTitle: (title: string | null) => void;
  icon: React.ElementType | null;
  setIcon: (icon: React.ElementType | null) => void;
  actions: React.ReactNode | null;
  setActions: (actions: React.ReactNode | null) => void;
}

const TitleContext = createContext<TitleContextType | undefined>(undefined);

export const useTitle = () => {
  const context = useContext(TitleContext);
  if (!context) throw new Error('useTitle must be used within a TitleProvider');
  return context;
};

export const TitleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [title, setTitle] = useState<string | null>(null);
  const [icon, setIcon] = useState<React.ElementType | null>(null);
  const [actions, setActions] = useState<React.ReactNode | null>(null);

  const stableSetTitle = React.useCallback((t: string | null) => setTitle(t), []);
  const stableSetIcon = React.useCallback((i: React.ElementType | null) => setIcon(i), []);
  const stableSetActions = React.useCallback((a: React.ReactNode | null) => setActions(a), []);

  const value = useMemo(() => ({
    title,
    setTitle: stableSetTitle,
    icon,
    setIcon: stableSetIcon,
    actions,
    setActions: stableSetActions
  }), [title, icon, actions, stableSetTitle, stableSetIcon, stableSetActions]);

  return (
    <TitleContext.Provider value={value}>
      {children}
    </TitleContext.Provider>
  );
};
