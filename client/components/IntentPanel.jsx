import { useEffect, useRef, useState } from "react";

function IntentCard({ intent }) {
  const {
    intent: intentText,
    action,
    parameters,
    when_text,
    datetime_iso,
    confidence,
    source_text,
    receivedAt,
  } = intent;

  return (
    <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold">Detected Intent</h3>
        <span className="text-xs text-gray-500">{receivedAt}</span>
      </div>
      <div className="text-sm"><strong>Intent:</strong> {intentText}</div>
      <div className="text-sm"><strong>Action:</strong> {action}</div>
      {when_text || datetime_iso ? (
        <div className="text-sm">
          <strong>When:</strong> {[when_text, datetime_iso].filter(Boolean).join("  •  ")}
        </div>
      ) : null}
      {typeof confidence === "number" ? (
        <div className="text-sm"><strong>Confidence:</strong> {Math.round(confidence * 100)}%</div>
      ) : null}
      {parameters && Object.keys(parameters).length > 0 ? (
        <div className="text-sm mt-1">
          <strong>Parameters:</strong>
          <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-x-auto">{JSON.stringify(parameters, null, 2)}</pre>
        </div>
      ) : null}
      {source_text ? (
        <div className="text-xs text-gray-600 mt-1"><strong>Source:</strong> "{source_text}"</div>
      ) : null}
    </div>
  );
}

export default function IntentPanel({ isSessionActive, events }) {
  const [intents, setIntents] = useState([]);
  const buffersRef = useRef({}); // item_id -> { name, argsStr }

  useEffect(() => {
    if (!events || events.length === 0) return;

    const ev = events[0];

    // 1) Final aggregated response with outputs array
    if (ev.type === "response.done" && ev.response && Array.isArray(ev.response.output)) {
      const detected = [];
      for (const out of ev.response.output) {
        if (out.type === "function_call" && out.name === "propose_intent") {
          try {
            const args = JSON.parse(out.arguments || "{}");
            detected.push({ ...normalizeIntentArgs(args), receivedAt: ts() });
          } catch (_) {
            // ignore
          }
        }
      }
      if (detected.length > 0) setIntents((prev) => [...detected, ...prev].slice(0, 50));
      return;
    }

    // 2) Streaming item added (may carry initial arguments)
    if (ev.type === "response.output_item.added" && ev.item && ev.item.type === "function_call") {
      const item = ev.item;
      if (item.name === "propose_intent") {
        const id = item.id || ev.item_id || `item_${Date.now()}`;
        if (!buffersRef.current[id]) buffersRef.current[id] = { name: item.name, argsStr: "" };
        if (item.arguments) buffersRef.current[id].argsStr += item.arguments;
      }
      return;
    }

    // 3) Streaming arguments delta
    if (ev.type === "response.function_call_arguments.delta") {
      const id = ev.item_id;
      if (id) {
        if (!buffersRef.current[id]) buffersRef.current[id] = { name: "", argsStr: "" };
        buffersRef.current[id].argsStr += ev.delta || "";
      }
      return;
    }

    // 4) Arguments done -> flush
    if (ev.type === "response.function_call_arguments.done") {
      const id = ev.item_id;
      if (!id) return;
      const buf = buffersRef.current[id];
      if (!buf) return;
      try {
        const jsonStr = ev.arguments || buf.argsStr || "{}";
        const args = JSON.parse(jsonStr);
        // Only record propose_intent
        if ((buf.name || args.name || "propose_intent") === "propose_intent") {
          const payload = { ...normalizeIntentArgs(args), receivedAt: ts() };
          setIntents((prev) => [payload, ...prev].slice(0, 50));
        }
      } catch (_) {
        // ignore
      } finally {
        delete buffersRef.current[id];
      }
      return;
    }

    // 5) Item done (catch-all flush if buffered)
    if (ev.type === "response.output_item.done" && ev.item_id) {
      const id = ev.item_id;
      const buf = buffersRef.current[id];
      if (!buf) return;
      try {
        const args = JSON.parse(buf.argsStr || "{}");
        if ((buf.name || args.name || "propose_intent") === "propose_intent") {
          const payload = { ...normalizeIntentArgs(args), receivedAt: ts() };
          setIntents((prev) => [payload, ...prev].slice(0, 50));
        }
      } catch (_) {
        // ignore
      } finally {
        delete buffersRef.current[id];
      }
    }
  }, [events]);

  useEffect(() => {
    if (!isSessionActive) setIntents([]);
  }, [isSessionActive]);

  return (
    <section className="w-full flex flex-col gap-4">
      <div className="bg-gray-50 rounded-md p-4">
        <h2 className="text-lg font-bold">Intent Panel</h2>
        {isSessionActive ? (
          intents.length > 0 ? (
            <div className="flex flex-col gap-2">
              {intents.map((intent, idx) => (
                <IntentCard key={idx} intent={intent} />
              ))}
            </div>
          ) : (
            <p>Say things like "remind me in 2 days" or other actions to see detected intents.</p>
          )
        ) : (
          <p>Start the session to detect intents...</p>
        )}
      </div>
    </section>
  );
}

function ts() {
  return new Date().toLocaleTimeString();
}

function normalizeIntentArgs(args) {
  // Ensure consistent shape for display
  const {
    intent = "",
    action = "",
    parameters = {},
    when_text = "",
    datetime_iso = "",
    confidence,
    source_text = "",
  } = args || {};
  return { intent, action, parameters, when_text, datetime_iso, confidence, source_text };
}
