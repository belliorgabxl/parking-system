"use client";

import Link from "next/link";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client";
import { useApp } from "@/components/AppProvider";
import { ConfirmSheet, LoadingScreen, Sheet, Spinner, TopBar } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { IconCar, IconEdit, IconPlus, IconStar, IconTrash } from "@/components/Icons";

type Vehicle = { id: string; makeModel: string; color: string; plate: string; text: string; isDefault: boolean };

export default function VehiclesPage() {
  const { me, refreshMe, toast } = useApp();
  const [editing, setEditing] = useState<{ id: string | null; text: string } | null>(null);
  const [deleting, setDeleting] = useState<Vehicle | null>(null);
  const [busy, setBusy] = useState(false);

  if (!me) return <LoadingScreen title="My cars" />;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      await refreshMe();
      toast(ok);
      setEditing(null);
      setDeleting(null);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    editing &&
    run(
      () =>
        editing.id
          ? api(`/api/vehicles/${editing.id}`, { method: "PATCH", body: { text: editing.text } })
          : api("/api/vehicles", { body: { text: editing.text } }),
      editing.id ? "Car updated" : "Car added",
    );

  return (
    <div className="screen">
      <TopBar title="My cars" back="/account" help={false} />
      <div className="body">
        {me.user.isGuest ? (
          <div className="card col gap-2.5">
            <b>Log in to save your cars</b>
            <span className="small muted">
              Your car is filled in automatically when you offer a spot, and shown to the provider when you grab one.
            </span>
            <Link href="/login?next=/account/vehicles" className="btn btn-dark">
              Log in
            </Link>
          </div>
        ) : (
          <>
            {me.vehicles.length === 0 && <p className="muted center mt-6">No cars saved yet.</p>}
            {me.vehicles.map((v) => (
              <div key={v.id} className="card row">
                <span className="icon-btn bg-[#f4f4f5]">
                  <IconCar />
                </span>
                <div className="col grow gap-0.5">
                  <b>
                    {v.makeModel || v.text} {v.isDefault && <span className="badge soft align-[2px]">Default</span>}
                  </b>
                  <span className="small muted">{[v.color, v.plate].filter(Boolean).join(" · ") || v.text}</span>
                </div>
                {!v.isDefault && (
                  <button
                    className="icon-btn sm"
                    aria-label="Set as default"
                    onClick={() =>
                      run(
                        () => api(`/api/vehicles/${v.id}`, { method: "PATCH", body: { isDefault: true } }),
                        "Default car updated",
                      )
                    }
                  >
                    <IconStar />
                  </button>
                )}
                <button className="icon-btn sm" aria-label="Edit" onClick={() => setEditing({ id: v.id, text: v.text })}>
                  <IconEdit />
                </button>
                <button className="icon-btn sm" aria-label="Delete" onClick={() => setDeleting(v)}>
                  <IconTrash size={16} />
                </button>
              </div>
            ))}
            {me.vehicles.length < 5 && (
              <button className="btn btn-outline" onClick={() => setEditing({ id: null, text: "" })}>
                <IconPlus /> Add a car
              </button>
            )}
            <p className="small faint center">Up to 5 cars. Your default car is used when you grab a spot.</p>
          </>
        )}
      </div>

      {editing && (
        <Sheet onClose={() => !busy && setEditing(null)}>
          <h3 className="h-section">{editing.id ? "Edit car" : "Add a car"}</h3>
          <VoiceInput
            value={editing.text}
            onChange={(text) => setEditing({ ...editing, text })}
            placeholder="Toyota Yaris, Red, AB1460"
            lang="en-US"
          />
          <span className="small faint">Make &amp; model, colour, plate — separated by commas.</span>
          <button className="btn btn-dark" onClick={save} disabled={busy || editing.text.trim().length < 2}>
            {busy ? <Spinner /> : "Save"}
          </button>
        </Sheet>
      )}
      {deleting && (
        <ConfirmSheet
          title={`Remove ${deleting.makeModel || "this car"}?`}
          danger
          busy={busy}
          confirmLabel="Remove"
          onConfirm={() => run(() => api(`/api/vehicles/${deleting.id}`, { method: "DELETE" }), "Car removed")}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
