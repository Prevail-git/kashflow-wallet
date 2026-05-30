## Problem

On `/receive`, tapping **Scan QR code** does nothing visible — the camera never opens.

## Root cause

In `src/routes/_authenticated/receive.tsx`, `startScan()`:

1. Calls `setMode("scanning")`
2. Immediately calls `document.getElementById("qr-reader")`
3. The `<div id="qr-reader">` is conditionally rendered **only** when `mode === "scanning"` — but React hasn't flushed the state update yet, so the element doesn't exist
4. `if (!el) return;` silently exits → no camera, no error toast

Secondary issues:
- `getUserMedia` ends up being invoked after several `await`s, which some mobile browsers (esp. iOS Safari) reject because the user-gesture context is lost.
- No surfaced error when camera permission is denied or unavailable — failures are swallowed.
- Scanner element id collisions if the component remounts quickly.

## Fix

Edit only `src/routes/_authenticated/receive.tsx`:

1. **Always render** the `<div id="qr-reader">` (hidden via CSS when not scanning) so it exists in the DOM when `startScan` runs. Alternatively, attach a `ref` and start the scanner inside a `useEffect` that runs when `mode === "scanning"`.
2. Move the `Html5Qrcode` construction + `.start()` into that effect, so:
   - the target node is guaranteed to exist,
   - permission errors are caught and shown via `toast.error(...)` with the actual message,
   - the effect's cleanup stops the scanner reliably.
3. Keep the **Scan QR code** button as a direct click handler that just sets `mode = "scanning"` — no awaits before the user gesture is consumed.
4. Show a clear fallback message ("Allow camera access in your browser, or paste the token below") when the scanner fails to start, and auto-return to `idle` mode.
5. Ensure `scanner.stop()` / `scanner.clear()` are awaited in cleanup to avoid the "Cannot start, scanner is busy" state on retry.

## Out of scope

No changes to crypto, offline queue, settlement, or other routes. Pure frontend fix to the Receive page.
