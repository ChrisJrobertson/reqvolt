"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

const EMAIL_FREQUENCIES = [
  { value: "immediate", label: "Immediate" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "off", label: "Off" },
] as const;

interface PrefValues {
  emailFrequency: string;
  notifySourceChanges: boolean;
  notifyDeliveryFeedback: boolean;
  notifyHealthDegraded: boolean;
  notifyEmailIngested: boolean;
  notifyMentions: boolean;
  notifyReplies: boolean;
}

const DEFAULT_PREF: PrefValues = {
  emailFrequency: "daily",
  notifySourceChanges: true,
  notifyDeliveryFeedback: true,
  notifyHealthDegraded: true,
  notifyEmailIngested: true,
  notifyMentions: true,
  notifyReplies: true,
};

function NotificationPreferencesFormInner({ initialPref }: { initialPref: PrefValues }) {
  const [emailFrequency, setEmailFrequency] = useState(initialPref.emailFrequency);
  const [notifySourceChanges, setNotifySourceChanges] = useState(
    initialPref.notifySourceChanges
  );
  const [notifyDeliveryFeedback, setNotifyDeliveryFeedback] = useState(
    initialPref.notifyDeliveryFeedback
  );
  const [notifyHealthDegraded, setNotifyHealthDegraded] = useState(
    initialPref.notifyHealthDegraded
  );
  const [notifyEmailIngested, setNotifyEmailIngested] = useState(
    initialPref.notifyEmailIngested
  );
  const [notifyMentions, setNotifyMentions] = useState(initialPref.notifyMentions);
  const [notifyReplies, setNotifyReplies] = useState(initialPref.notifyReplies);
  const [saved, setSaved] = useState(false);

  const update = trpc.notificationPreference.update.useMutation({
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate({
      emailFrequency: emailFrequency as "immediate" | "daily" | "weekly" | "off",
      notifySourceChanges,
      notifyDeliveryFeedback,
      notifyHealthDegraded,
      notifyEmailIngested,
      notifyMentions,
      notifyReplies,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-8">
      <section>
        <h2 className="text-lg font-semibold mb-2">Email digest frequency</h2>
        <p className="text-sm text-muted-foreground mb-4">
          How often you receive email summaries of activity
        </p>
        <div className="flex flex-wrap gap-2">
          {EMAIL_FREQUENCIES.map((f) => (
            <label
              key={f.value}
              className={`flex items-center px-4 py-2 rounded-lg border cursor-pointer ${
                emailFrequency === f.value
                  ? "border-primary bg-primary/10"
                  : "hover:bg-muted/50"
              }`}
            >
              <input
                type="radio"
                name="emailFrequency"
                value={f.value}
                checked={emailFrequency === f.value}
                onChange={() => setEmailFrequency(f.value)}
                className="sr-only"
              />
              <span className="text-sm font-medium">{f.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Notify me about</h2>
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-sm">Source changes affecting my packs</span>
            <button
              type="button"
              role="switch"
              aria-checked={notifySourceChanges}
              onClick={() => setNotifySourceChanges(!notifySourceChanges)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                notifySourceChanges ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  notifySourceChanges ? "left-6" : "left-1"
                }`}
              />
            </button>
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-sm">
              Delivery feedback from Jira/Monday.com
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={notifyDeliveryFeedback}
              onClick={() => setNotifyDeliveryFeedback(!notifyDeliveryFeedback)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                notifyDeliveryFeedback ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  notifyDeliveryFeedback ? "left-6" : "left-1"
                }`}
              />
            </button>
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-sm">Pack health degradation</span>
            <button
              type="button"
              role="switch"
              aria-checked={notifyHealthDegraded}
              onClick={() => setNotifyHealthDegraded(!notifyHealthDegraded)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                notifyHealthDegraded ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  notifyHealthDegraded ? "left-6" : "left-1"
                }`}
              />
            </button>
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-sm">Sources received via email</span>
            <button
              type="button"
              role="switch"
              aria-checked={notifyEmailIngested}
              onClick={() => setNotifyEmailIngested(!notifyEmailIngested)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                notifyEmailIngested ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  notifyEmailIngested ? "left-6" : "left-1"
                }`}
              />
            </button>
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-sm">@mentions in story comments</span>
            <button
              type="button"
              role="switch"
              aria-checked={notifyMentions}
              onClick={() => setNotifyMentions(!notifyMentions)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                notifyMentions ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  notifyMentions ? "left-6" : "left-1"
                }`}
              />
            </button>
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-sm">Replies to my story comments</span>
            <button
              type="button"
              role="switch"
              aria-checked={notifyReplies}
              onClick={() => setNotifyReplies(!notifyReplies)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                notifyReplies ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  notifyReplies ? "left-6" : "left-1"
                }`}
              />
            </button>
          </label>
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={update.isPending}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          {update.isPending ? "Saving..." : "Save"}
        </button>
        {saved && (
          <span className="text-sm text-green-600">Preferences saved</span>
        )}
      </div>
    </form>
  );
}

export function NotificationPreferencesForm() {
  const { data: pref, isLoading } = trpc.notificationPreference.get.useQuery();

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <NotificationPreferencesFormInner
      initialPref={pref ?? DEFAULT_PREF}
    />
  );
}
