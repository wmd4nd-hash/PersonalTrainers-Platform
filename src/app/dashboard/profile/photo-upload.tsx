import { Avatar } from "@/components/avatar";

/** Profile photo. Upload is implemented by the trust & admin feature. */
export function PhotoUpload({ name, avatarFileId }: { name: string; avatarFileId: string | null }) {
  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} fileId={avatarFileId} size={64} />
    </div>
  );
}
