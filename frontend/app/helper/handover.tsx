import React, { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { HelperHandoverView, HandoverNote } from "@/src/components/HelperHandoverView";
import { api } from "@/src/lib/api";

export default function ParentHelperHandover() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [notes, setNotes] = useState<HandoverNote[]>([]);

  const load = useCallback(async () => {
    try {
      const d = await api(`/helpers/${id}/handover`);
      setNotes(d.notes || []);
    } catch {}
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onSend = async (text: string) => {
    await api(`/helpers/${id}/handover`, { method: "POST", body: { text } });
    await load();
  };

  return (
    <HelperHandoverView
      title={name || "Helper"}
      notes={notes}
      mine="parent"
      composerLabel="Leave a note for your helper"
      placeholder="e.g. Aarav has a dentist appointment at 4pm"
      onBack={() => router.back()}
      onSend={onSend}
    />
  );
}
