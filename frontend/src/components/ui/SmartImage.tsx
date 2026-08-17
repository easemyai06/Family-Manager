import React from "react";
import { Image, ImageProps } from "expo-image";
import { mediaImageSource } from "@/src/lib/api";

interface Props extends Omit<ImageProps, "source"> {
  uri?: string | null;
}

// Resolves internal (/api/files/...) urls with auth (bearer header on native,
// token query on web) and renders external urls (unsplash etc.) directly.
// Uses expo-image for caching + blurhash.
export function SmartImage({ uri, style, contentFit = "cover", ...rest }: Props) {
  const source = mediaImageSource(uri);
  return (
    <Image
      source={source}
      style={style}
      contentFit={contentFit}
      transition={200}
      {...rest}
    />
  );
}
