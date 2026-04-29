"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
  Textarea,
} from "flowbite-react";
import { Plus } from "flowbite-react-icons/outline";
import { useCampaignStore, type Campaign } from "@/store/campaign-store";

function PencilIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
      />
    </svg>
  );
}

function CampaignFormModal({
  show,
  onClose,
  campaign,
  onSave,
  saving,
}: {
  show: boolean;
  onClose: () => void;
  campaign: Campaign | null;
  onSave: (data: {
    campaignID: string;
    title: string;
    content: string;
  }) => void;
  saving: boolean;
}) {
  const isEditing = !!campaign;
  const [campaignID, setCampaignID] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  return (
    <Modal show={show} onClose={onClose} size="lg">
      <ModalHeader>{isEditing ? "Edit Campaign" : "New Campaign"}</ModalHeader>
      <ModalBody>
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="campaignID" value="Campaign ID" />
            <TextInput
              id="campaignID"
              placeholder="e.g. summer-2026"
              value={campaignID}
              onChange={(e) => setCampaignID(e.target.value)}
              disabled={isEditing}
            />
          </div>
          <div>
            <Label htmlFor="title" value="Title" />
            <TextInput
              id="title"
              placeholder="Campaign title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="content" value="Content" />
            <Textarea
              id="content"
              placeholder="Campaign description (optional)"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
            />
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button
          color="blue"
          onClick={() => onSave({ campaignID, title, content })}
          disabled={saving}
        >
          {saving
            ? isEditing
              ? "Saving..."
              : "Creating..."
            : isEditing
              ? "Save Changes"
              : "Create"}
        </Button>
        <Button color="gray" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function DeleteConfirmModal({
  show,
  onClose,
  campaign,
  onConfirm,
  deleting,
}: {
  show: boolean;
  onClose: () => void;
  campaign: Campaign | null;
  onConfirm: () => void;
  deleting: boolean;
}) {
  return (
    <Modal show={show} onClose={onClose} size="md">
      <ModalHeader>Delete Campaign</ModalHeader>
      <ModalBody>
        <p className="text-sm text-gray-500">
          Are you sure you want to delete{" "}
          <strong>{campaign?.title ?? "this campaign"}</strong>? This action
          cannot be undone.
        </p>
      </ModalBody>
      <ModalFooter>
        <Button color="red" onClick={onConfirm} disabled={deleting}>
          {deleting ? "Deleting..." : "Delete"}
        </Button>
        <Button color="gray" onClick={onClose} disabled={deleting}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default function CampaignPage() {
  const {
    campaigns,
    loading,
    error,
    saving,
    deleting,
    loadCampaigns,
    createCampaign,
    updateCampaign,
    deleteCampaign,
  } = useCampaignStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState<Campaign | null>(
    null,
  );

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  const handleCreate = async (data: {
    campaignID: string;
    title: string;
    content: string;
  }) => {
    const ok = await createCampaign(data);
    if (ok) setShowCreateModal(false);
  };

  const handleUpdate = async (data: {
    campaignID: string;
    title: string;
    content: string;
  }) => {
    if (!editingCampaign) return;
    const ok = await updateCampaign({
      id: editingCampaign.id,
      title: data.title,
      content: data.content,
    });
    if (ok) setEditingCampaign(null);
  };

  const handleSave = editingCampaign ? handleUpdate : handleCreate;

  const handleDelete = async () => {
    if (!deletingCampaign) return;
    const ok = await deleteCampaign(deletingCampaign.id);
    if (ok) setDeletingCampaign(null);
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Campaigns</h2>
        <Button color="blue" onClick={() => setShowCreateModal(true)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          New Campaign
        </Button>
      </div>

      {/* Error alert */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="flex flex-col gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse overflow-hidden rounded-lg bg-white shadow-sm"
            >
              <div className="px-4 py-5 sm:p-6">
                <div className="h-5 w-48 rounded bg-gray-200" />
                <div className="mt-3 h-4 w-64 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && campaigns.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-gray-300 px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No campaigns yet.</p>
          <p className="mt-1 text-sm text-gray-400">
            Create your first campaign to get started.
          </p>
        </div>
      )}

      {/* Campaign list */}
      {!loading && campaigns.length > 0 && (
        <div className="flex flex-col gap-4">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="group overflow-hidden rounded-lg bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between px-4 py-5 sm:p-6">
                <a
                  href={`/tab/campaign/${campaign.campaignID}`}
                  className="flex-1"
                >
                  <h3 className="text-base font-semibold leading-6 text-gray-900">
                    {campaign.title}
                  </h3>
                  {campaign.content && (
                    <p className="mt-2 text-sm text-gray-500 line-clamp-2">
                      {campaign.content}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    ID: {campaign.campaignID}
                  </p>
                </a>

                {/* Action buttons */}
                <div className="ml-4 flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setEditingCampaign(campaign);
                    }}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    title="Edit"
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setDeletingCampaign(campaign);
                    }}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    title="Delete"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <CampaignFormModal
        key={editingCampaign?.id ?? "create"}
        show={showCreateModal || !!editingCampaign}
        onClose={() => {
          setShowCreateModal(false);
          setEditingCampaign(null);
        }}
        campaign={editingCampaign}
        onSave={handleSave}
        saving={saving}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        show={!!deletingCampaign}
        onClose={() => setDeletingCampaign(null)}
        campaign={deletingCampaign}
        onConfirm={handleDelete}
        deleting={deleting}
      />
    </div>
  );
}
