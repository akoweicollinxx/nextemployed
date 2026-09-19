import Vapi from '@vapi-ai/web';

// The Vapi SDK calls console.error() directly from inside its Krisp WASM cleanup
// path when a call ends before the noise-cancellation worker has fully initialised.
// A try/catch around vapi.stop() can't intercept a console.error — so we wrap it
// here, at module-load time, to drop that one specific message before Next.js's
// dev-overlay handler turns it into a visible error card.
const _consoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const msg =
    typeof args[0] === 'string'
      ? args[0]
      : args[0] instanceof Error
        ? args[0].message
        : '';
  if (msg.includes('WASM_OR_WORKER_NOT_READY')) return;
  if (msg.includes('daily-js version') && msg.includes('no longer supported')) return;
  // Fires when the AI ends the meeting cleanly — not a real error.
  if (msg.includes('Meeting ended due to ejection') || msg.includes('Meeting has ended')) return;
  _consoleError(...args);
};

const vapi = new Vapi(process.env.NEXT_PUBLIC_VAPI_WEB_TOKEN!);

export default vapi;
