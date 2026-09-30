"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Loader2, Play, RefreshCw, Search, Stamp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/hooks/use-toast"
import { useMeraBaseTemplates, type BaseTemplateActionOutcome } from "@/hooks/use-mera-base-templates"
import { useMeraProjects } from "@/hooks/use-mera-projects"
import { notifyBaseTemplatesChanged } from "@/hooks/use-base-template-counts"
import { BaseTemplateListItem } from "@/components/base-templates/base-template-list-item"
import { BaseTemplateReviewModal } from "@/components/base-templates/base-template-review-modal"
import { NeedRepairDialog } from "@/components/base-templates/need-repair-dialog"
import {
  type QueueEntry,
  flattenEntries,
  hasWaitingOrders,
  isNeedRepair,
  isTypingTarget,
  needsReview,
  statusOf,
} from "@/components/base-templates/utils"

type QueueTab = "queue" | "repair"

const SEARCH_DEBOUNCE_MS = 400
const PROJECT_FILTER_KEY = "base-templates-project-filter"
// Radix Select cannot hold "" as an item value.
const ALL_PROJECTS = "__all__"

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
  const [reviewOpen, setReviewOpen] = useState(false)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState<QueueTab>("queue")
  // Queue tab: only variants holding orders back right now. On by default on every visit.
  const [onlyWithOrders, setOnlyWithOrders] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [repairOpen, setRepairOpen] = useState(false)
  const [busy, setBusy] = useState<"confirm" | "repair" | null>(null)
  // Image to show first in the Product tab when the review opens from a thumbnail click.
  const [focusImage, setFocusImage] = useState<{ key: string; url: string } | null>(null)
  // "" = every project. Read back from localStorage before the first load, so a checker who
  // works one project does not first pull the whole queue.
  const [projectId, setProjectId] = useState("")
  const [projectRestored, setProjectRestored] = useState(false)
  const lastIndexRef = useRef(0)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())

  const { projects, loading: projectsLoading, error: projectsError } = useMeraProjects()
  const bt = useMeraBaseTemplates({ projectId, search, enabled: projectRestored })

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PROJECT_FILTER_KEY)
      if (saved) setProjectId(saved)
    } catch {
      // storage unavailable — every project
    }
    setProjectRestored(true)
  }, [])

  const changeProject = useCallback((value: string) => {
    const next = value === ALL_PROJECTS ? "" : value
    setProjectId(next)
    try {
      if (next) localStorage.setItem(PROJECT_FILTER_KEY, next)
      else localStorage.removeItem(PROJECT_FILTER_KEY)
    } catch {
      // ignore
    }
  }, [])

  // A saved project that no longer exists (or the checker lost access) → back to all.
  useEffect(() => {
    if (!projectId || projectsLoading || projectsError || projects.length === 0) return
    if (!projects.some((p) => p.id === projectId)) changeProject(ALL_PROJECTS)
  }, [projectId, projects, projectsLoading, projectsError, changeProject])

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)),
    [projects]
  )
  const selectedProjectName = projectId ? projects.find((p) => p.id === projectId)?.name : undefined

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [searchInput])

  const queueEntries = useMemo(
    () => flattenEntries(bt.queue, onlyWithOrders ? hasWaitingOrders : needsReview),
    [bt.queue, onlyWithOrders]
  )
  const repairEntries = useMemo(() => flattenEntries(bt.repair, isNeedRepair), [bt.repair])
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

  // Like the order review modal: Space / Shift+Space stop at both ends (no wrap-around).
  const goNext = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < entries.length - 1) setSelectedKey(entries[selectedIndex + 1].key)
  }, [entries, selectedIndex])
  const goPrev = useCallback(() => {
    if (selectedIndex > 0) setSelectedKey(entries[selectedIndex - 1].key)
  }, [entries, selectedIndex])

  const openReview = useCallback(
    (key?: string, imageUrl?: string) => {
      const target = key ?? selectedKey ?? entries[0]?.key
      if (!target) return
      setSelectedKey(target)
      setFocusImage(imageUrl ? { key: target, url: imageUrl } : null)
      setReviewOpen(true)
    },
    [selectedKey, entries]
  )

  // Nothing left to review (all done, filtered out, tab switched) → back to the list.
  useEffect(() => {
    if (reviewOpen && entries.length === 0 && !bt.loading) setReviewOpen(false)
  }, [reviewOpen, entries.length, bt.loading])

  // Keep the row of the variant being reviewed in view, so closing the modal lands there.
  // (Only while reviewing: on first load the page must stay at the top.)
  useEffect(() => {
    if (reviewOpen && selectedKey) rowRefs.current.get(selectedKey)?.scrollIntoView({ block: "nearest" })
  }, [selectedKey, reviewOpen])

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

  // List shortcuts (the modal owns its own while open): Enter opens the review on the
  // selected variant. Deliberately NOT gated on NODE_ENV.
  useEffect(() => {
    if (reviewOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      // A focused row / button / open dropdown (project filter) handles its own Enter.
      if (e.target instanceof HTMLElement && e.target.closest("button, a, [role='button'], [role='option'], [role='listbox']")) return
      e.preventDefault()
      openReview()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [reviewOpen, openReview])

  const loadedPtCount = tab === "queue" ? bt.queue.length : bt.repair.length
  const reportedPtTotal = tab === "queue" ? bt.queueTotal : bt.repairTotal

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6 space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Base Template Review</h1>
              <p className="text-gray-600 mt-2">Duyệt base template của Mera — mỗi dòng là một variant cần kiểm tra</p>
            </div>
            {bt.settings && (
              <Badge
                variant="outline"
                className={
                  autoStatusOff
                    ? "bg-amber-50 text-amber-800 border-amber-300 text-sm px-3 py-1"
                    : "bg-green-50 text-green-800 border-green-300 text-sm px-3 py-1"
                }
              >
                Công tắc {autoStatusOff ? "TẮT" : "BẬT"}
              </Badge>
            )}
          </div>
        </div>

        <Card className="border-gray-200 shadow-sm">
          <div className="p-6 space-y-4">
            {/* Header Row */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-semibold text-gray-900">Base Templates</h2>
                <span className="text-sm text-gray-600">
                  {entries.length.toLocaleString()} variant{tab === "queue" ? " cần duyệt" : " chờ designer sửa"}
                </span>
                {projectId && (
                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
                    project: {selectedProjectName || projectId}
                  </Badge>
                )}
                {search.trim() && (
                  <Badge variant="secondary" className="bg-orange-50 text-orange-700 border-orange-200">
                    tìm: {search.trim()}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    notifyBaseTemplatesChanged()
                    void bt.refetch({ nocache: true })
                  }}
                  disabled={bt.loading}
                  className="flex items-center gap-2 bg-transparent border-gray-300"
                >
                  <RefreshCw className={`h-4 w-4 ${bt.loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                {entries.length > 0 && (
                  <Button onClick={() => openReview()} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                    <Play className="h-4 w-4 mr-2" />
                    Start Review
                  </Button>
                )}
              </div>
            </div>

            {/* Project + search + tabs */}
            <div className="flex items-center gap-4 flex-wrap">
              <Select value={projectId || ALL_PROJECTS} onValueChange={changeProject}>
                <SelectTrigger className="w-[220px] border-gray-300" title={projectsError ? `Không tải được project: ${projectsError}` : undefined}>
                  <SelectValue placeholder="Tất cả project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_PROJECTS}>Tất cả project</SelectItem>
                  {/* Saved project not in the list (yet): keep it selectable so the trigger has a label. */}
                  {projectId && !projects.some((p) => p.id === projectId) && (
                    <SelectItem value={projectId}>{projectsLoading ? "Đang tải..." : projectId}</SelectItem>
                  )}
                  {sortedProjects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name || p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex-1 min-w-[240px] relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") (e.target as HTMLInputElement).blur()
                  }}
                  placeholder="Tìm product type..."
                  className="pl-10 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <Tabs value={tab} onValueChange={(v) => setTab(v as QueueTab)}>
                <TabsList>
                  <TabsTrigger value="queue">Hàng đợi ({queueEntries.length})</TabsTrigger>
                  <TabsTrigger value="repair">Chờ designer sửa ({repairEntries.length})</TabsTrigger>
                </TabsList>
              </Tabs>
              {tab === "queue" && (
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlyWithOrders}
                    onChange={(e) => setOnlyWithOrders(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Chỉ template có đơn chờ
                </label>
              )}
            </div>

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
            {tab === "repair" && (
              <div className="text-xs text-gray-500">
                Chỉ xem — các template này đang chờ designer sửa; khi designer bấm “Đã sửa xong”, chúng quay lại hàng
                đợi (REPAIRED).
              </div>
            )}
          </div>
        </Card>

        {/* List */}
        {bt.loading && entries.length === 0 ? (
          <Card className="border-gray-200 shadow-sm">
            <div className="p-12 flex items-center justify-center text-gray-600">
              <Loader2 className="h-6 w-6 animate-spin mr-3 text-blue-600" />
              Đang tải base template...
            </div>
          </Card>
        ) : entries.length === 0 ? (
          <Card className="border-gray-200 shadow-sm">
            <div className="p-12 flex flex-col items-center justify-center space-y-4">
              <Stamp className="h-12 w-12 text-gray-400" />
              <div className="text-center">
                <h3 className="text-xl font-semibold text-gray-900">
                  {tab === "queue" ? "Không có base template nào cần duyệt." : "Không có template nào chờ designer sửa."}
                </h3>
                {tab === "queue" && onlyWithOrders ? (
                  <p className="text-sm text-gray-500 mt-2">
                    Đang chỉ hiện template có đơn chờ — bỏ chọn “Chỉ template có đơn chờ” để xem cả hàng đợi.
                  </p>
                ) : (
                  (search.trim() || projectId) && (
                    <p className="text-sm text-gray-500 mt-2">
                      {projectId
                        ? "Đang lọc theo một project — thử chọn “Tất cả project”."
                        : "Thử bỏ bớt từ khoá tìm kiếm."}
                    </p>
                  )
                )}
              </div>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <BaseTemplateListItem
                key={entry.key}
                ref={(el) => {
                  if (el) rowRefs.current.set(entry.key, el)
                  else rowRefs.current.delete(entry.key)
                }}
                entry={entry}
                selected={entry.key === selectedKey}
                showProject={!projectId}
                onOpen={(imageUrl) => openReview(entry.key, imageUrl)}
              />
            ))}
          </div>
        )}

        {reviewOpen && selected && (
          <BaseTemplateReviewModal
            isOpen={reviewOpen}
            onClose={() => {
              setReviewOpen(false)
              setFocusImage(null)
            }}
            entry={selected}
            focusImageUrl={focusImage && focusImage.key === selected.key ? focusImage.url : null}
            currentIndex={selectedIndex}
            totalCount={entries.length}
            onNext={goNext}
            onPrevious={goPrev}
            readOnly={tab === "repair"}
            busy={busy}
            canConfirm={canConfirm}
            canAct={canAct}
            autoStatusOff={bt.settings ? autoStatusOff : null}
            onConfirm={() => void handleConfirm()}
            onRequestNeedRepair={() => {
              if (canAct) setRepairOpen(true)
            }}
            shortcutsPaused={repairOpen}
          />
        )}

        <NeedRepairDialog
          open={repairOpen}
          onOpenChange={setRepairOpen}
          templateLabel={selected ? selected.pt.display_name || selected.pt.slug : ""}
          pendingCount={selected?.variant.pending_count ?? 0}
          submitting={busy === "repair"}
          onSubmit={(note) => void handleNeedRepair(note)}
        />
      </div>
    </div>
  )
}
