import { create } from "zustand";
import { fetchAccess, GUEST_ACCESS, type AppAccess } from "../lib/billing";
import { supabase } from "../lib/supabase";

type AccessState = {
  access: AppAccess;
  loading: boolean;
  refresh: () => Promise<void>;
};

export const useAccess = create<AccessState>((set) => ({
  access: GUEST_ACCESS,
  loading: true,
  refresh: async () => {
    set({ loading: true });
    set({ access: await fetchAccess(), loading: false });
  }
}));

export function initAccess(): void {
  void useAccess.getState().refresh();
  supabase?.auth.onAuthStateChange(() => {
    void useAccess.getState().refresh();
  });
}
