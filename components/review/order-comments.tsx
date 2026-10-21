"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MessageSquare, Bell, BellOff, ChevronDown, ChevronUp, Loader2, Wrench } from "lucide-react"
import { useOrderComments } from "@/hooks/use-order-comments"
import { formatDistanceToNow } from "date-fns"
import { useAuth } from "@/contexts/auth-context"
import { uploadImageToS3, extractImageUrls } from "@/lib/s3-upload"
import { parseNeedRepairComment } from "@/lib/need-repair-comment"
import { useGlobalPresence } from "@/hooks/use-global-presence"
import { PresenceAvatars } from "./presence-avatars"

interface OrderCommentsProps {
  itemId: string
  // Header label; a second thread on the same panel (base template) names itself here.
  title?: string
  // Online avatars — once per panel, so a second thread turns them off.
  showPresence?: boolean
}

export function OrderComments({ itemId, title = "Discussion", showPresence = true }: OrderCommentsProps) {
  const { user } = useAuth()
  const { comments, loading, error, submitting, postComment } = useOrderComments(itemId)
  const { onlineUsers } = useGlobalPresence(showPresence)
  const [commentText, setCommentText] = useState("")
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [hasLoadedComments, setHasLoadedComments] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const commentsEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isSubmittingRef = useRef(false)

  useEffect(() => {
    setIsExpanded(false)
    setHasLoadedComments(false)
    setCommentText("")
  }, [itemId])

  useEffect(() => {
    if (!loading && !hasLoadedComments) {
      setHasLoadedComments(true)
      if (comments.length > 0) {
        setIsExpanded(true)
      }
    }
  }, [loading, comments.length, hasLoadedComments])

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationsEnabled(Notification.permission === "granted")
    }
  }, [])

  const handleRequestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      alert("This browser does not support notifications")
      return
    }

    const permission = await Notification.requestPermission()
    setNotificationsEnabled(permission === "granted")

    if (permission === "granted") {
      new Notification("Notifications Enabled", {
        body: "You will now receive notifications for new comments",
      })
    }
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]

      if (item.type.indexOf("image") !== -1) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue

        try {
          setUploadingImage(true)
          setUploadProgress(0)

          const imageUrl = await uploadImageToS3(file, (progress) => {
            setUploadProgress(progress.percentage)
          })

          // Insert image URL at cursor position
          const textarea = textareaRef.current
          if (textarea) {
            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            const newText = commentText.substring(0, start) + imageUrl + "\n" + commentText.substring(end)
            setCommentText(newText)

            // Set cursor position after the inserted URL
            setTimeout(() => {
              textarea.selectionStart = textarea.selectionEnd = start + imageUrl.length + 1
              textarea.focus()
            }, 0)
          } else {
            setCommentText((prev) => prev + "\n" + imageUrl)
          }
        } catch (error) {
          console.error("[OrderComments] Image upload failed:", error)
          alert("Failed to upload image. Please try again.")
        } finally {
          setUploadingImage(false)
          setUploadProgress(0)
        }
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!commentText.trim() || !user || isSubmittingRef.current) return

    isSubmittingRef.current = true
    try {
      const success = await postComment({
        comment_text: commentText.trim(),
        user_name: user.name,
        user_email: user.email,
        user_avatar: user.avatar_url || null,
      })

      if (success) {
        setCommentText("")
        if (!isExpanded) {
          setIsExpanded(true)
        }
        setTimeout(() => textareaRef.current?.focus(), 0)
      }
    } finally {
      isSubmittingRef.current = false
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2)
  }

  const renderCommentContent = (text: string) => {
    const imageUrls = extractImageUrls(text)

    if (imageUrls.length === 0) {
      return <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{text}</p>
    }

    const parts: React.ReactNode[] = []
    let lastIndex = 0

    imageUrls.forEach((url, index) => {
      const urlIndex = text.indexOf(url, lastIndex)

      // Add text before the URL
      if (urlIndex > lastIndex) {
        const textBefore = text.substring(lastIndex, urlIndex)
        if (textBefore.trim()) {
          parts.push(
            <p key={`text-${index}`} className="text-xs text-gray-700 whitespace-pre-wrap break-words mb-2">
              {textBefore}
            </p>,
          )
        }
      }

      // Add image
      parts.push(
        <img
          key={`img-${index}`}
          src={url || "/placeholder.svg"}
          alt="Comment attachment"
          className="max-w-full h-auto rounded-lg border border-gray-200 my-2"
          style={{ maxHeight: "300px" }}
          loading="lazy"
        />,
      )

      lastIndex = urlIndex + url.length
    })

    // Add remaining text after last URL
    if (lastIndex < text.length) {
      const textAfter = text.substring(lastIndex)
      if (textAfter.trim()) {
        parts.push(
          <p key="text-end" className="text-xs text-gray-700 whitespace-pre-wrap break-words mt-2">
            {textAfter}
          </p>,
        )
      }
    }

    return <div className="space-y-1">{parts}</div>
  }

  const sortedComments = [...comments].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  return (
    <div className="border-b border-gray-200">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-2 hover:bg-gray-50 rounded px-2 py-1 -ml-2 transition-colors"
            >
              <MessageSquare className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
              {loading ? (
                <span className="text-xs text-gray-400">(Loading...)</span>
              ) : comments.length > 0 ? (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{comments.length}</span>
              ) : (
                <span className="text-xs text-gray-400">(No comments)</span>
              )}
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
            {showPresence && <PresenceAvatars users={onlineUsers} label="online" maxDisplay={5} />}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRequestNotificationPermission}
            className={`h-7 w-7 p-0 ${notificationsEnabled ? "text-blue-600 hover:bg-blue-50" : "text-gray-400 hover:bg-gray-100"}`}
            title={notificationsEnabled ? "Notifications enabled" : "Enable notifications"}
          >
            {notificationsEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </Button>
        </div>

        {isExpanded && (
          <>
            <div className="space-y-3 max-h-[400px] overflow-y-auto mb-4">
              {loading && comments.length === 0 ? (
                <div className="text-xs text-gray-500 text-center py-4">Loading comments...</div>
              ) : error ? (
                <div className="text-xs text-red-600 text-center py-4">{error}</div>
              ) : comments.length === 0 ? (
                <div className="text-xs text-gray-500 text-center py-4 bg-gray-50 rounded-lg">
                  No comments yet. Start the discussion!
                </div>
              ) : (
                sortedComments.map((comment) => {
                  // NEED REPAIR status message (posted by checkflow): drawn as a round divider —
                  // the comments above it (newer) belong to that repair round.
                  const repair = parseNeedRepairComment(comment.comment_text)
                  if (repair) {
                    return (
                      <div key={comment.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                        <div className="flex items-center gap-2 text-xs">
                          <Wrench className="h-3.5 w-3.5 flex-shrink-0 text-red-600" />
                          <span className="font-semibold text-red-700">NEED REPAIR</span>
                          {repair.title && <span className="text-red-700">· {repair.title}</span>}
                        </div>
                        <div className="mt-0.5 text-[11px] text-red-600/80">
                          {comment.user_name} · {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                        </div>
                        {repair.note && <div className="mt-1.5">{renderCommentContent(repair.note)}</div>}
                      </div>
                    )
                  }
                  return (
                    <div key={comment.id} className="flex gap-3 bg-gray-50 rounded-lg p-3">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarImage src={comment.user_avatar || undefined} alt={comment.user_name} />
                        <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                          {getInitials(comment.user_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-xs font-semibold text-gray-900">{comment.user_name}</span>
                          <span className="text-xs text-gray-500">
                            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        {renderCommentContent(comment.comment_text)}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-2">
              {uploadingImage && (
                <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Uploading image... {uploadProgress}%</span>
                </div>
              )}

              <Textarea
                ref={textareaRef}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={
                  user
                    ? "Add a comment... (Press Enter to send, Shift+Enter for new line, paste images directly)"
                    : "Please log in to comment"
                }
                rows={3}
                className="text-xs border-gray-200 focus:border-blue-300 focus:ring-blue-200 resize-none"
                disabled={!user || uploadingImage}
              />
            </form>
          </>
        )}
      </div>
    </div>
  )
}
