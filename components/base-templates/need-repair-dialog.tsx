"use client"

import { useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface NeedRepairDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateLabel: string
  pendingCount: number
  submitting: boolean
  onSubmit: (note: string) => void
}

// Radix Dialog closes on Esc by itself. Ctrl/Cmd+Enter submits from the textarea.
export function NeedRepairDialog({
  open,
  onOpenChange,
  templateLabel,
  pendingCount,
  submitting,
  onSubmit,
}: NeedRepairDialogProps) {
  const [note, setNote] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const trimmed = note.trim()

  useEffect(() => {
    if (open) {
      setNote("")
      // Focus after Radix finishes mounting the content.
      const t = setTimeout(() => textareaRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  const submit = () => {
    if (!trimmed || submitting) return
    onSubmit(trimmed)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>NEED REPAIR — {templateLabel}</DialogTitle>
          <DialogDescription>
            Designer sẽ nhận ghi chú này. Mọi đơn chưa xuất của variant (DESIGNED / REPAIRED / CONFIRMED
            {pendingCount > 0 ? `, hiện ${pendingCount} đơn chờ` : ""}) bị thu hồi về NEED REPAIR, bất kể công tắc.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          ref={textareaRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Cần sửa gì? (bắt buộc)"
          rows={5}
          disabled={submitting}
        />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Huỷ (Esc)
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!trimmed || submitting}>
            {submitting ? "Đang gửi..." : "NEED REPAIR (Ctrl+Enter)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
