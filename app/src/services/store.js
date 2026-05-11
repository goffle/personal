import { create } from "zustand";

const useStore = create((set) => ({
  user: null,
  setUser: (user) => set(() => ({ user })),

  organization: JSON.parse(localStorage.getItem("console-organization") || "null"),
  setOrganization: (organization) => {
    if (organization) localStorage.setItem("console-organization", JSON.stringify(organization));
    else localStorage.removeItem("console-organization");
    set(() => ({ organization }));
  },
}));

export default useStore;
