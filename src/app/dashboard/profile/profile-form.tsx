"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/actions/trainer";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input, Textarea } from "@/components/ui";

type ProfileValues = {
  headline: string;
  bio: string;
  specialties: string;
  city: string;
  timezone: string;
  yearsExperience: number;
  sessionRate: string;
  sessionMinutes: number;
  currency: string;
  published: boolean;
};

export function ProfileForm({ profile }: { profile: ProfileValues }) {
  const [state, action] = useActionState(updateProfile, {});
  const errors = state.fieldErrors ?? {};

  return (
    <Card>
      <form action={action} className="space-y-4">
        {state.ok && <Alert tone="success">Profile saved.</Alert>}
        {state.error && <Alert>{state.error}</Alert>}

        <Field label="Headline" name="headline" errors={errors.headline} hint="One line, e.g. “Strength coach for busy parents”">
          <Input id="headline" name="headline" defaultValue={profile.headline} maxLength={120} />
        </Field>
        <Field label="About you" name="bio" errors={errors.bio}>
          <Textarea id="bio" name="bio" rows={6} defaultValue={profile.bio} maxLength={2000} />
        </Field>
        <Field label="Specialties" name="specialties" errors={errors.specialties} hint="Comma separated, e.g. strength, mobility, pre-natal">
          <Input id="specialties" name="specialties" defaultValue={profile.specialties} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" name="city" errors={errors.city} hint="Leave blank if you only coach online">
            <Input id="city" name="city" defaultValue={profile.city} />
          </Field>
          <Field label="Timezone" name="timezone" errors={errors.timezone} hint="IANA name, e.g. Europe/London">
            <Input id="timezone" name="timezone" defaultValue={profile.timezone} required />
          </Field>
          <Field label={`Session price (${profile.currency})`} name="sessionRate" errors={errors.sessionRate}>
            <Input id="sessionRate" name="sessionRate" inputMode="decimal" defaultValue={profile.sessionRate} required />
          </Field>
          <Field label="Session length (minutes)" name="sessionMinutes" errors={errors.sessionMinutes}>
            <Input id="sessionMinutes" name="sessionMinutes" type="number" min={15} max={240} step={15} defaultValue={profile.sessionMinutes} required />
          </Field>
          <Field label="Years of experience" name="yearsExperience" errors={errors.yearsExperience}>
            <Input id="yearsExperience" name="yearsExperience" type="number" min={0} max={60} defaultValue={profile.yearsExperience} required />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="published" defaultChecked={profile.published} className="accent-brand" />
          Publish my profile so clients can find and book me
        </label>

        <SubmitButton>Save profile</SubmitButton>
      </form>
    </Card>
  );
}
