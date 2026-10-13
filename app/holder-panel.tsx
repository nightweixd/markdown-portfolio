"use client";
import { useEffect, useState } from "react";
import { Users, ArrowUpRight } from "lucide-react";
import type { HolderData } from "@/lib/chainbase";
export default function HolderPanel({
  address,
  enabled,
}: {
  address: string;
  enabled: boolean;
}) {
  const [data, setData] = useState<HolderData | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    setData(null);
    setError("");
    if (!enabled) return;
    const controller = new AbortController();
    fetch("/api/holders?address=" + address, { signal: controller.signal })
      .then(async (r) => {
        const result = (await r.json()) as HolderData & { error?: string };
        if (!r.ok) throw new Error(result.error ?? "Holder data unavailable");
        setData(result);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [address, enabled]);
  return (
    <div className="holder-block">
      <h3>
        <Users size={16} />
        On-chain holders <span>Chainbase</span>
      </h3>
      {!enabled ? (
        <p>Connect Chainbase to inspect indexed holders.</p>
      ) : error ? (
        <p>{error}</p>
      ) : !data ? (
        <p>Loading holder snapshot…</p>
      ) : (
        <>
          <div className="holder-total">
            <span>Indexed holder count</span>
            <b>{data.total?.toLocaleString() ?? "Unknown"}</b>
          </div>
          {data.holders.slice(0, 5).map((h, i) => (
            <a
              key={h.address}
              href={"https://bscscan.com/address/" + h.address}
              target="_blank"
              rel="noreferrer"
            >
              <span>{i + 1}</span>
              <span>
                {h.address.slice(0, 8)}…{h.address.slice(-5)}
              </span>
              <b>
                {Number.isFinite(Number(h.amount))
                  ? new Intl.NumberFormat("en-US", {
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(Number(h.amount))
                  : "—"}
              </b>
              <ArrowUpRight size={12} />
            </a>
          ))}
          <small>
            Top balances in token units. Includes pools and burn wallets.
            Indexing may lag; balances are not a safety score.
          </small>
        </>
      )}
    </div>
  );
}
