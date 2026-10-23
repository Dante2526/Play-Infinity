/** Detached iframe messages must not control the next episode or provider. */
export function isCurrentPlayerMessageSource(
  source: MessageEventSource | null,
  frame: Window | null | undefined,
  localWindow: Window,
  offline: boolean,
  reportedFrameUrl?: string,
  currentFrameUrl?: string,
) {
  if (source === localWindow) return offline || (!!frame && !!reportedFrameUrl && reportedFrameUrl === currentFrameUrl);
  return !!frame && source === frame;
}

/** Catalogue lookup is shared; stop waiting without cancelling other consumers. */
export async function waitForPlayerLookup(lookup: Promise<unknown>, timeoutMs = 4000) {
  let timer: ReturnType<typeof setTimeout>;
  try {
    await Promise.race([lookup, new Promise<void>(resolve => { timer = setTimeout(resolve, timeoutMs); })]);
  } finally { clearTimeout(timer!); }
}
