import React, { useCallback, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { CareTeamChatView, CareMsg } from "@/src/components/CareTeamChatView";
import { api, uploadMedia } from "@/src/lib/api";

export default function ParentCareTeam() {
  const router = useRouter();
  const [messages, setMessages] = useState<CareMsg[]>([]);
  const [me, setMe] = useState<string | undefined>(undefined);
  const [helpers, setHelpers] = useState<any[]>([]);
  const timer = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const d = await api("/care-team/chat");
      setMessages(d.messages || []);
      setMe(d.me);
      setHelpers(d.helpers || []);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      timer.current = setInterval(load, 4000);
      return () => timer.current && clearInterval(timer.current);
    }, [load])
  );

  const onSend = async (text: string) => {
    await api("/care-team/chat", { method: "POST", body: { text } });
    await load();
  };

  const onSendPhoto = async (uri: string) => {
    const up = await uploadMedia(uri, "image");
    await api("/care-team/chat", { method: "POST", body: { photo_url: up.url } });
    await load();
  };

  const subtitle = helpers.length ? `You + ${helpers.map((h) => h.name).join(", ")}` : "You + your helpers";

  return (
    <CareTeamChatView
      subtitle={subtitle}
      messages={messages}
      myType="parent"
      myId={me}
      onBack={() => router.back()}
      onSend={onSend}
      onSendPhoto={onSendPhoto}
    />
  );
}
