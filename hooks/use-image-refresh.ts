"use client"

import { useSyncExternalStore } from "react"
import { bumpImageEpoch, getImageEpoch, subscribeImageEpoch } from "@/lib/drive-image"
import { clearResolvedDesignLinks } from "@/utils/design-links"

// Current "Tải lại ảnh" epoch — components that build image URLs or resolve Drive folders
// re-run when it changes.
export function useImageEpoch(): number {
  return useSyncExternalStore(subscribeImageEpoch, getImageEpoch, () => 0)
}

// Re-read every image on screen: forget the expanded Drive folder listings (files added or
// replaced since), then move every image URL to a new epoch.
export function refreshImages() {
  clearResolvedDesignLinks()
  bumpImageEpoch()
}
