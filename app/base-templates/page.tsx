"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Check, ChevronDown, ChevronUp, Loader2, RefreshCw, Search, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/hooks/use-toast"
import { useMeraProjects } from "@/hooks/use-mera-projects"
import { useMeraBaseTemplates, type BaseTemplateActionOutcome } from "@/hooks/use-mera-base-templates"
import { MeraProjectSelector } from "@/components/review/mera-project-selector"
import { QueueList } from "@/components/base-templates/queue-list"
import { TemplateViewer } from "@/components/base-templates/template-viewer"
import { VariantDetails } from "@/components/base-templates/variant-details"
import { NeedRepairDialog } from "@/components/base-templates/need-repair-dialog"
import {
  type QueueEntry,
  conditionSummary,
  flattenEntries,
  isTypingTarget,
  needsReview,
  statusOf,
} from "@/components/base-templates/utils"

type QueueTab = "queue" | "repair"

const SEARCH_DEBOUNCE_MS = 400

function conflictOrError(outcome: Extract<BaseTemplateActionOutcome, { ok: false }>): {
  conflict: boolean
  message: string
} {
  if (outcome.status === 409) {
    const current = outcome.body.current_status
    return {
      conflict: true,
      message: `Người khác vừa xử lý template này${current !== undefined ? ` (hiện: ${current || "chưa duyệt"})` : ""}. Đã tải lại.`,
    }
  }
  return {
    conflict: false,
    message: outcome.body.error || outcome.body.message || `Lỗi HTTP ${outcome.status}`,
  }
}

export default function BaseTemplatesPage() {
  const [projectId, setProjectId] = useState("")
  const [showProjects, setShowProjects] = useState(false)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState<QueueTab>("queue")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [repairOpen, setRepairOpen] = useState(false)
  const [busy, setBusy] = useState<"confirm" | "repair" | null>(null)
  const lastIndexRef = useRef(0)

  const { projects, loading: projectsLoading, error: projectsError } = useMeraProjects()
  const bt = useMeraBaseTemplates({ projectId, search })

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchInput])

  const queueEntries = useMemo(() => flattenEntries(bt.queue, needsReview), [bt.queue])
  const repairEntries = useMemo(
    () => flattenEntries(bt.repair, (v) => statusOf(v) === "NEED REPAIR"),
    [bt.repair]
  )
  const entries: QueueEntry[] = tab === "queue" ? queueEntries : repairEntries

  // Keep a valid selection: when the selected variant leaves the list (confirmed, filtered
  // out, tab switch), fall back to whatever now sits at the same position.
  useEffect(() => {
    if (entries.length === 0) {
      if (selectedKey !== null) setSelectedKey(null)
      return
    }
    const idx = selectedKey ? entries.findIndex((e) => e.key === selectedKey) : -1
    if (idx >= 0) {
      lastIndexRef.current = idx
      return
    }
    const fallback = entries[Math.min(lastIndexRef.current, entries.length - 1)]
    setSelectedKey(fallback.key)
  }, [entries, selectedKey])

  const selectedIndex = selectedKey ? entries.findIndex((e) => e.key === selectedKey) : -1
  const selected = selectedIndex >= 0 ? entries[selectedIndex] : null
  const selectedStatus = selected ? statusOf(selected.variant) : ""
  const canAct = tab === "queue" && !!selected && busy === null
  const canConfirm = canAct && selectedStatus !== "NEED REPAIR"
  const autoStatusOff = bt.settings?.auto_status_enabled === false

  const selectIndex = useCallback(
    (i: number) => {
      if (entries.length === 0) return
      const clamped = (i + entries.length) % entries.length
      setSelectedKey(entries[clamped].key)
    },
    [entries]
  )

  const goNext = useCallback(() => selectIndex(selectedIndex + 1), [selectIndex, selectedIndex])
  const goPrev = useCallback(() => selectIndex(selectedIndex - 1), [selectIndex, selectedIndex])

  // After an action: move to the next variant right away, then reload bypassing Mera's
  // 60s list cache. If the next one vanished meanwhile, the selection effect falls back
  // to the same position.
  const advanceAndRefetch = useCallback(async () => {
    const next = entries[selectedIndex + 1] ?? null
    if (next) {
      lastIndexRef.current = selectedIndex + 1
      setSelectedKey(next.key)
    } else {
      lastIndexRef.current = Math.max(selectedIndex, 0)
    }
    await bt.refetch({ nocache: true })
  }, [entries, selectedIndex, bt])

  const handleConfirm = useCallback(async () => {
    if (!selected || !canAct) return
    const { pt, variant } = selected
    if (statusOf(variant) === "NEED REPAIR") {
      toast({ title: "Template đang NEED REPAIR — chờ designer sửa, không duyệt được", variant: "destructive" })
      return
    }

    setBusy("confirm")
    try {
      const outcome = await bt.confirm({
        project_id: pt.project_id,
        product_type: pt.slug,
        design_link: variant.base_template_design,
        // Exactly the signatures on screen — Mera cascades/learns only these.
        signatures: (variant.pending_values ?? []).map((p) => p.signature),
        expected_status: variant.base_template_status,
      })

      if (!outcome.ok) {
        const { conflict, message } = conflictOrError(outcome)
        toast({ title: conflict ? "Xung đột" : "Duyệt thất bại", description: message, variant: "destructive" })
        // 409 = someone moved it; 400 = its state no longer allows this (e.g. NEED REPAIR
        // meanwhile) — either way the row on screen is stale.
        if (conflict || outcome.status === 400) await bt.refetch({ nocache: true })
        return
      }

      const r = outcome.data
      const lines: string[] = []
      if (r.auto_status_enabled === false) {
        lines.push("Đơn giữ DESIGNED vì công tắc TẮT — chỉ đổi trạng thái template + ghi nhận giá trị.")
      } else if (r.affected_count > 0) {
        lines.push(`${r.affected_count} đơn → CONFIRMED.`)
      } else {
        // Flag-only approve (no waiting orders), or someone else already moved them.
        lines.push("Không có đơn chờ nào để chuyển — chỉ đổi trạng thái template.")
      }
      if ((r.skipped_count ?? 0) > 0) {
        lines.push(`${r.skipped_count} đơn giá trị mới vừa về — variant còn trong hàng đợi.`)
      }
      if (r.flag_warning) lines.push(`Cảnh báo: ${r.flag_warning}`)

      toast({
        title: r.flag_warning ? "Đã xử lý đơn nhưng cờ template lỗi" : `Đã duyệt: ${pt.display_name || pt.slug}`,
        description: (
          <div className="space-y-0.5">
            {lines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        ),
        variant: r.flag_warning ? "destructive" : "default",
      })
      await advanceAndRefetch()
    } catch (err) {
      toast({ title: "Duyệt thất bại", description: (err as Error).message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }, [selected, canAct, bt, advanceAndRefetch])

  const handleNeedRepair = useCallback(
    async (note: string) => {
      if (!selected || !canAct) return
      const { pt, variant } = selected
      setBusy("repair")
      try {
        const outcome = await bt.needRepair({
          project_id: pt.project_id,
          product_type: pt.slug,
          design_link: variant.base_template_design,
          note,
        })

        if (!outcome.ok) {
          const { conflict, message } = conflictOrError(outcome)
          toast({ title: conflict ? "Xung đột" : "NEED REPAIR thất bại", description: message, variant: "destructive" })
          if (conflict || outcome.status === 400) {
            setRepairOpen(false)
            await bt.refetch({ nocache: true })
          }
          return
        }

        const r = outcome.data
        setRepairOpen(false)
        toast({
          title: r.flag_warning ? "Đã thu hồi đơn nhưng cờ template lỗi" : `NEED REPAIR: ${pt.display_name || pt.slug}`,
          description: (
            <div className="space-y-0.5">
              <div>{r.affected_count} đơn thu hồi về NEED REPAIR.</div>
              {r.flag_warning && <div>Cảnh báo: {r.flag_warning}</div>}
            </div>
          ),
          variant: r.flag_warning ? "destructive" : "default",
        })
        await advanceAndRefetch()
      } catch (err) {
        toast({ title: "NEED REPAIR thất bại", description: (err as Error).message, variant: "destructive" })
      } finally {
        setBusy(null)
      }
    },
    [selected, canAct, bt, advanceAndRefetch]
  )

  // Shortcuts: 1 = CONFIRMED, 2 = NEED REPAIR, Space / Shift+Space = next / previous.
  // Esc is handled by the dialog itself. Deliberately NOT gated on NODE_ENV.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (repairOpen) return
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      switch (e.key) {
        case "1":
          e.preventDefault()
          if (canConfirm) void handleConfirm()
          else if (selectedStatus === "NEED REPAIR" && tab === "queue") {
            toast({ title: "Template đang NEED REPAIR — không duyệt được", variant: "destructive" })
          }
          break
        case "2":
          e.preventDefault()
          if (canAct) setRepairOpen(true)
          break
        case " ":
          e.preventDefault()
          if (busy) return
          if (e.shiftKey) goPrev()
          else goNext()
          break
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [repairOpen, canConfirm, canAct, busy, selectedStatus, tab, handleConfirm, goNext, goPrev])

  const selectedProjectName = projectId ? (projects.find((p) => p.id === projectId)?.name ?? projectId) : "All projects"
  const loadedPtCount = tab === "queue" ? bt.queue.length : bt.repair.length
  const reportedPtTotal = tab === "queue" ? bt.queueTotal : bt.repairTotal

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-y-auto p-3 gap-3">
      {/* ── Top bar ── */}
      <div className="flex-shrink-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowProjects((s) => !s)} className="bg-white">
            Project: <span className="font-semibold ml-1">{selectedProjectName}</span>
            {showProjects ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
          </Button>
          <div className="relative w-72">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") (e.target as HTMLInputElement).blur()
              }}
              placeholder="Tìm product type..."
              className="pl-8 h-9 bg-white"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="bg-white"
            onClick={() => bt.refetch({ nocache: true })}
            disabled={bt.loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${bt.loading ? "animate-spin" : ""}`} />
            Tải lại
          </Button>
          <div className="ml-auto text-xs text-gray-500 hidden lg:block">
            Phím: <kbd className="px-1 border rounded bg-white">1</kbd> CONFIRMED ·{" "}
            <kbd className="px-1 border rounded bg-white">2</kbd> NEED REPAIR ·{" "}
            <kbd className="px-1 border rounded bg-white">Space</kbd>/<kbd className="px-1 border rounded bg-white">Shift+Space</kbd>{" "}
            kế/trước · <kbd className="px-1 border rounded bg-white">D</kbd>/<kbd className="px-1 border rounded bg-white">M</kbd>/
            <kbd className="px-1 border rounded bg-white">P</kbd> tab · <kbd className="px-1 border rounded bg-white">R</kbd> xoay
          </div>
        </div>

        {showProjects && (
          <MeraProjectSelector
            projects={projects}
            projectsLoading={projectsLoading}
            selectedProjectId={projectId}
            onProjectSelect={(id) => {
              setProjectId(id)
              setShowProjects(false)
            }}
            ordersLoading={false}
            error={projectsError}
          />
        )}

        {bt.settings && autoStatusOff && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              <b>Công tắc đang TẮT</b> — duyệt chỉ đổi trạng thái template (và ghi nhận giá trị), đơn giữ DESIGNED.
              NEED REPAIR vẫn thu hồi đơn.
            </span>
          </div>
        )}
        {bt.settings && !autoStatusOff && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-xs text-green-800">
            Công tắc BẬT — CONFIRMED sẽ tự chuyển các đơn chờ mang giá trị đang hiển thị sang CONFIRMED.
          </div>
        )}
        {!bt.settings && bt.settingsError && (
          <div className="rounded-md border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs text-gray-700">
            Không đọc được trạng thái công tắc ({bt.settingsError}).
          </div>
        )}
        {bt.error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{bt.error}</div>
        )}
        {reportedPtTotal > loadedPtCount && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
            Đang hiện {loadedPtCount}/{reportedPtTotal} product type — lọc theo project hoặc tìm để thu hẹp.
          </div>
        )}
      </div>

      {/* ── Main: queue | viewer | details ── */}
      <div className="flex-1 min-h-[560px] grid grid-cols-[300px_minmax(0,1fr)_360px] gap-3">
        <div className="flex flex-col min-h-0 rounded-lg border bg-white">
          <Tabs value={tab} onValueChange={(v) => setTab(v as QueueTab)} className="flex-shrink-0 p-2 border-b">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="queue">Hàng đợi ({queueEntries.length})</TabsTrigger>
              <TabsTrigger value="repair">Chờ designer sửa ({repairEntries.length})</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {bt.loading && entries.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Đang tải...
              </div>
            ) : (
              <QueueList
                entries={entries}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
                showProject={!projectId}
                emptyText={tab === "queue" ? "Không có base template nào cần duyệt." : "Không có template nào chờ designer sửa."}
              />
            )}
          </div>
        </div>

        <div className="min-h-0 rounded-lg border bg-white p-2">
          {selected ? (
            <TemplateViewer
              key={selected.key}
              pt={selected.pt}
              variant={selected.variant}
              shortcutsEnabled={!repairOpen}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">Chọn một variant ở hàng đợi.</div>
          )}
        </div>

        <div className="flex flex-col min-h-0 rounded-lg border bg-white">
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {selected ? (
              <VariantDetails pt={selected.pt} variant={selected.variant} />
            ) : (
              <div className="text-sm text-gray-500">—</div>
            )}
          </div>
          <div className="flex-shrink-0 border-t p-3 space-y-2">
            {tab === "repair" ? (
              <div className="text-xs text-gray-600">
                Chỉ xem — template đang chờ designer sửa. Khi designer bấm “Đã sửa xong”, nó quay lại hàng đợi (REPAIRED).
              </div>
            ) : (
              <>
                {selected && (
                  <div className="text-[11px] text-gray-500">
                    {selectedIndex + 1}/{entries.length} · {conditionSummary(selected.variant)}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => void handleConfirm()}
                    disabled={!canConfirm}
                    title={selectedStatus === "NEED REPAIR" ? "Template đang NEED REPAIR" : "Phím 1"}
                  >
                    {busy === "confirm" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                    CONFIRMED (1)
                  </Button>
                  <Button variant="destructive" onClick={() => setRepairOpen(true)} disabled={!canAct} title="Phím 2">
                    {busy === "repair" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Wrench className="h-4 w-4 mr-1" />}
                    NEED REPAIR (2)
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <NeedRepairDialog
        open={repairOpen}
        onOpenChange={setRepairOpen}
        templateLabel={selected ? selected.pt.display_name || selected.pt.slug : ""}
        pendingCount={selected?.variant.pending_count ?? 0}
        submitting={busy === "repair"}
        onSubmit={(note) => void handleNeedRepair(note)}
      />
    </div>
  )
}
