import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ProfileForms } from "./profile-forms";

export default async function ProfilePage() {
  const { profile } = await getSession();
  return (
    <>
      <PageHeader title="My Profile" />
      <ProfileForms profile={profile} />
    </>
  );
}
