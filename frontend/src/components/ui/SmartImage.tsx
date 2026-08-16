import React from "react";
import { Image, ImageProps } from "expo-image";
import { mediaUrl } from "@/src/lib/api";

interface Props extends Omit<ImageProps, "source"> {
  uri?: string | null;
}

// Resolves internal (/api/files/...) urls with an auth token and renders
// external urls (unsplash etc.) directly. Uses expo-image for caching + blurhash.
export function SmartImage({ uri, style, contentFit = "cover", ...rest }: Props) {
  const resolved = mediaUrl(uri);
  return (
    <Image
      source={resolved ? { uri: resolved } : undefined}
      style={style}
      contentFit={contentFit}
      transition={200}
      {...rest}
    />
  );
}
