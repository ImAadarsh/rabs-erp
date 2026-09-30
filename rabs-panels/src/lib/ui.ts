import { create } from 'zustand';

type UIState = {
  sidebarOpen: boolean;
  toggleSidebar: (open?: boolean) => void;
};

export const useUI = create<UIState>((set) => ({
  sidebarOpen: false,
  toggleSidebar: (open) => set((s) => ({ sidebarOpen: typeof open === 'boolean' ? open : !s.sidebarOpen }))
}));


