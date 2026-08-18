import React, { useCallback, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { HelperChatView, HelperMsg } from "@/src/components/HelperChatView";
import { helperApi, setHelperToken } from "@/src/lib/helperApi";

export default function HelperPortalChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<HelperMsg[]>([]);
  const [family, setFamily] = useState<string>("Family");
  const timer = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const d = await helperApi("/helper/chat");
      setMessages(d.messages || []);
    } catch (e: any) {
      if (e?.status === 401) {
        await setHelperToken(null);
        router.replace("/helper-login");
      } else if (e?.status === 403) {
        router.back();
      }
    }
  }, [router]);

  const loadName = useCallback(async () => {
    try {
      const d = await helperApi("/helper/me");
      setFamily(d.helper?.family_name || "Family");
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadName();
      load();
      timer.current = setInterval(load, 4000);
      return () => timer.current && clearInterval(timer.current);
    }, [load, loadName])
  );

  const onSend = async (text: string) => {
    await helperApi("/helper/chat", { method: "POST", body: { text } });
    await load();
  };

  return (
    <HelperChatView
      title={family}
      subtitle="Chat with the family"
      messages={messages}
      mine="helper"
      onBack={() => router.back()}
      onSend={onSend}
    />
  );
}
