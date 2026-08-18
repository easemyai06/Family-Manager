import React, { useCallback, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { CareTeamChatView, CareMsg } from "@/src/components/CareTeamChatView";
import { helperApi, helperUpload, setHelperToken } from "@/src/lib/helperApi";

export default function HelperPortalCareTeam() {
  const router = useRouter();
  const [messages, setMessages] = useState<CareMsg[]>([]);
  const [me, setMe] = useState<string | undefined>(undefined);
  const timer = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const d = await helperApi("/helper/care-team");
      setMessages(d.messages || []);
      setMe(d.me);
    } catch (e: any) {
      if (e?.status === 401) {
        await setHelperToken(null);
        router.replace("/helper-login");
      } else if (e?.status === 403) {
        router.back();
      }
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      load();
      timer.current = setInterval(load, 4000);
      return () => timer.current && clearInterval(timer.current);
    }, [load])
  );

  const onSend = async (text: string) => {
    await helperApi("/helper/care-team", { method: "POST", body: { text } });
    await load();
  };

  const onSendPhoto = async (uri: string) => {
    const up = await helperUpload(uri);
    await helperApi("/helper/care-team", { method: "POST", body: { photo_url: up.url } });
    await load();
  };

  return (
    <CareTeamChatView
      subtitle="Parents + helpers"
      messages={messages}
      myType="helper"
      myId={me}
      onBack={() => router.back()}
      onSend={onSend}
      onSendPhoto={onSendPhoto}
    />
  );
}
