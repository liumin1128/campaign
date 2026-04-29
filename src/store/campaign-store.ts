import { create } from "zustand";

export type Campaign = {
  id: number;
  campaignID: string;
  title: string;
  content: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type CampaignState = {
  campaigns: Campaign[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  deleting: boolean;
  loadCampaigns: () => Promise<void>;
  createCampaign: (input: {
    campaignID: string;
    title: string;
    content?: string;
  }) => Promise<boolean>;
  updateCampaign: (input: {
    id: number;
    title?: string;
    content?: string;
    campaignID?: string;
  }) => Promise<boolean>;
  deleteCampaign: (id: number) => Promise<boolean>;
};

export const useCampaignStore = create<CampaignState>()((set) => ({
  campaigns: [],
  loading: false,
  error: null,
  saving: false,
  deleting: false,

  loadCampaigns: async () => {
    set({ loading: true, error: null });

    try {
      const response = await fetch("/api/campaign", {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        campaigns?: Campaign[];
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to load campaigns");
      }

      set({
        campaigns: payload.campaigns ?? [],
        loading: false,
        error: null,
      });
    } catch (error) {
      set({
        campaigns: [],
        loading: false,
        error:
          error instanceof Error ? error.message : "Failed to load campaigns",
      });
    }
  },

  createCampaign: async ({ campaignID, title, content }) => {
    const trimmedID = campaignID.trim();
    const trimmedTitle = title.trim();

    if (!trimmedID || !trimmedTitle) {
      set({ error: "campaignID and title are required" });
      return false;
    }

    set({ saving: true, error: null });

    try {
      const response = await fetch("/api/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignID: trimmedID,
          title: trimmedTitle,
          content: content?.trim() ?? null,
        }),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        campaign?: Campaign;
      };

      if (!response.ok || !payload.ok || !payload.campaign) {
        throw new Error(payload.error ?? "Failed to create campaign");
      }

      set((state) => ({
        campaigns: [payload.campaign!, ...state.campaigns],
        saving: false,
        error: null,
      }));

      return true;
    } catch (error) {
      set({
        saving: false,
        error:
          error instanceof Error ? error.message : "Failed to create campaign",
      });
      return false;
    }
  },

  updateCampaign: async ({ id, title, content, campaignID }) => {
    if (!id) {
      set({ error: "id is required" });
      return false;
    }

    set({ saving: true, error: null });

    try {
      const response = await fetch("/api/campaign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title, content, campaignID }),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        campaign?: Campaign;
      };

      if (!response.ok || !payload.ok || !payload.campaign) {
        throw new Error(payload.error ?? "Failed to update campaign");
      }

      set((state) => ({
        campaigns: state.campaigns.map((c) =>
          c.id === id ? payload.campaign! : c,
        ),
        saving: false,
        error: null,
      }));

      return true;
    } catch (error) {
      set({
        saving: false,
        error:
          error instanceof Error ? error.message : "Failed to update campaign",
      });
      return false;
    }
  },

  deleteCampaign: async (id) => {
    set({ deleting: true, error: null });

    try {
      const response = await fetch(`/api/campaign?id=${id}`, {
        method: "DELETE",
      });

      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to delete campaign");
      }

      set((state) => ({
        campaigns: state.campaigns.filter((c) => c.id !== id),
        deleting: false,
        error: null,
      }));

      return true;
    } catch (error) {
      set({
        deleting: false,
        error:
          error instanceof Error ? error.message : "Failed to delete campaign",
      });
      return false;
    }
  },
}));
