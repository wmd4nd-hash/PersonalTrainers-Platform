"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/actions/trainer";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Field, Input, Select, Textarea } from "@/components/ui";

export type ProfileValues = {
  headline: string;
  bio: string;
  specialties: string;
  languages: string;
  gender: string;
  city: string;
  timezone: string;
  yearsExperience: number;
  sessionRate: string;
  sessionMinutes: number;
  currency: string;
  offersInPerson: boolean;
  offersOnline: boolean;
  defaultLocation: string;
  meetingUrl: string;
  cancellationWindowHours: number;
  lateCancelFeePercent: number;
  minNoticeHours: number;
  published: boolean;
};

export function ProfileForm({ profile }: { profile: ProfileValues }) {
  const [state, action] = useActionState(updateProfile, {});
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-6">
      {state.ok && <Alert tone="success">Profile saved.</Alert>}
      {state.error && <Alert>{state.error}</Alert>}

      <Card className="space-y-4">
        <h2 className="font-semibold">About you</h2>
        <Field label="Headline" name="headline" errors={errors.headline} hint="One line, e.g. “Strength coach for busy parents”">
          <Input id="headline" name="headline" defaultValue={profile.headline} maxLength={120} />
        </Field>
        <Field label="Bio" name="bio" errors={errors.bio}>
          <Textarea id="bio" name="bio" rows={6} defaultValue={profile.bio} maxLength={2000} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Specialties" name="specialties" errors={errors.specialties} hint="Comma separated, e.g. strength, mobility">
            <Input id="specialties" name="specialties" defaultValue={profile.specialties} />
          </Field>
          <Field label="Languages" name="languages" errors={errors.languages} hint="Comma separated, e.g. english, spanish">
            <Input id="languages" name="languages" defaultValue={profile.languages} />
          </Field>
          <Field label="Gender" name="gender" errors={errors.gender} hint="Some clients prefer a trainer of a particular gender">
            <Select id="gender" name="gender" defaultValue={profile.gender}>
              <option value="UNSPECIFIED">Prefer not to say</option>
              <option value="FEMALE">Female</option>
              <option value="MALE">Male</option>
              <option value="NON_BINARY">Non-binary</option>
            </Select>
          </Field>
          <Field label="Years of experience" name="yearsExperience" errors={errors.yearsExperience}>
            <Input id="yearsExperience" name="yearsExperience" type="number" min={0} max={60} defaultValue={profile.yearsExperience} required />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Sessions</h2>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Session types</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="offersInPerson" defaultChecked={profile.offersInPerson} className="accent-brand" />
            In person
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="offersOnline" defaultChecked={profile.offersOnline} className="accent-brand" />
            Online (video)
          </label>
          {errors.offersOnline?.map((e) => (
            <p key={e} className="text-xs text-red-600 dark:text-red-400">{e}</p>
          ))}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" name="city" errors={errors.city} hint="Leave blank if you only coach online">
            <Input id="city" name="city" defaultValue={profile.city} />
          </Field>
          <Field label="Timezone" name="timezone" errors={errors.timezone} hint="IANA name, e.g. Europe/London">
            <Input id="timezone" name="timezone" defaultValue={profile.timezone} required />
          </Field>
          <Field label="Where in-person sessions happen" name="defaultLocation" errors={errors.defaultLocation} hint="Shown to clients after they book">
            <Input id="defaultLocation" name="defaultLocation" defaultValue={profile.defaultLocation} placeholder="e.g. PureGym Camden, or client's home" />
          </Field>
          <Field label="Video link for online sessions" name="meetingUrl" errors={errors.meetingUrl} hint="Leave blank to get a private video room for each session">
            <Input id="meetingUrl" name="meetingUrl" type="url" defaultValue={profile.meetingUrl} placeholder="https://zoom.us/j/…" />
          </Field>
          <Field label={`Session price (${profile.currency})`} name="sessionRate" errors={errors.sessionRate}>
            <Input id="sessionRate" name="sessionRate" inputMode="decimal" defaultValue={profile.sessionRate} required />
          </Field>
          <Field label="Session length (minutes)" name="sessionMinutes" errors={errors.sessionMinutes}>
            <Input id="sessionMinutes" name="sessionMinutes" type="number" min={15} max={240} step={15} defaultValue={profile.sessionMinutes} required />
          </Field>
          <Field label="Minimum notice (hours)" name="minNoticeHours" errors={errors.minNoticeHours} hint="How soon before a session clients can book it">
            <Input id="minNoticeHours" name="minNoticeHours" type="number" min={0} max={72} defaultValue={profile.minNoticeHours} required />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Cancellation policy</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Free cancellation up to (hours before)" name="cancellationWindowHours" errors={errors.cancellationWindowHours}>
            <Input id="cancellationWindowHours" name="cancellationWindowHours" type="number" min={0} max={168} defaultValue={profile.cancellationWindowHours} required />
          </Field>
          <Field label="Late cancellation fee (% of price)" name="lateCancelFeePercent" errors={errors.lateCancelFeePercent} hint="0 means clients can always cancel for free">
            <Input id="lateCancelFeePercent" name="lateCancelFeePercent" type="number" min={0} max={100} step={5} defaultValue={profile.lateCancelFeePercent} required />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="published" defaultChecked={profile.published} className="accent-brand" />
          Publish my profile so clients can find and book me
        </label>
        <SubmitButton>Save profile</SubmitButton>
      </Card>
    </form>
  );
}
