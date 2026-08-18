import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { HelperChatView, HelperMsg } from "@/src/components/HelperChatView";
import { api } from "@/src/lib/api";

export default function ParentHelperChat() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [messages, setMessages] = useState<HelperMsg[]>([]);
  const [helper, setHelper] = useState<any>(null);
  const timer = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const d = await api(`/helpers/${id}/chat`);
      setMessages(d.messages || []);
      setHelper(d.helper || null);
    } catch {}
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
      timer.current = setInterval(load, 4000);
      return () => timer.current && clearInterval(timer.current);
    }, [load])
  );

  const onSend = async (text: string) => {
    await api(`/helpers/${id}/chat`, { method: "POST", body: { text } });
    await load();
  };

  return (
    <HelperChatView
      title={helper?.name || name || "Helper"}
      subtitle="Private helper chat"
      avatarUri={helper?.photo_url}
      messages={messages}
      mine="parent"
      onBack={() => router.back()}
      onSend={onSend}
      disabled={helper ? !helper.can_chat : false}
      disabledHint="Turn on the Parent chat permission for this helper to message them."
    />
  );
}
