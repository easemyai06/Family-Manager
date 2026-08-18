import React, { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { HelperHandoverView, HandoverNote } from "@/src/components/HelperHandoverView";
import { helperApi, setHelperToken } from "@/src/lib/helperApi";

export default function HelperPortalHandover() {
  const router = useRouter();
  const [notes, setNotes] = useState<HandoverNote[]>([]);

  const load = useCallback(async () => {
    try {
      const d = await helperApi("/helper/handover");
      setNotes(d.notes || []);
    } catch (e: any) {
      if (e?.status === 401) {
        await setHelperToken(null);
        router.replace("/helper-login");
      }
    }
  }, [router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onSend = async (text: string) => {
    await helperApi("/helper/handover", { method: "POST", body: { text } });
    await load();
  };

  return (
    <HelperHandoverView
      title="Daily handover"
      notes={notes}
      mine="helper"
      composerLabel="End-of-day note for the family"
      placeholder="e.g. All tasks done, Aarav finished homework"
      onBack={() => router.back()}
      onSend={onSend}
    />
  );
}
