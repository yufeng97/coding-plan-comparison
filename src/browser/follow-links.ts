

export function buildFollowSyncUrl(planIds: string[]) {
    return location.href.split(/[?#]/)[0] + "?follow=" + planIds.join(",") + "#updates";
}
