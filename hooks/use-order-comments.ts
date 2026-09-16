"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/contexts/auth-context"
import { getAblyBrowserClient } from "@/lib/ably-browser-client"
import type { OrderComment, CommentResponse, CreateCommentRequest } from "@/types/comment"

export function useOrderComments(itemId: string) {
  const [comments, setComments] = useState<OrderComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { user, getToken } = useAuth()

  const fetchComments = useCallback(async () => {
    const token = getToken()
    if (!user || !token) {
      setError("User not authenticated")
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const response = await fetch(`/api/comments/${encodeURIComponent(itemId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const result: CommentResponse = await response.json()

      if (result.success) {
        setComments(result.data)
        setError(null)
      } else {
        setError(result.error || "Failed to fetch comments")
      }
    } catch (err) {
      setError("Failed to fetch comments")
      console.error("[useOrderComments] Error fetching comments:", err)
    } finally {
      setLoading(false)
    }
  }, [itemId, user, getToken])

  const postComment = useCallback(
    async (commentData: CreateCommentRequest) => {
      const token = getToken()
      if (!user || !token) {
        setError("User not authenticated")
        return false
      }

      try {
        setSubmitting(true)
        const response = await fetch(`/api/comments/${encodeURIComponent(itemId)}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(commentData),
        })

        const result = await response.json()

        if (result.success) {
          setComments((prev) => {
            const exists = prev.some((c) => c.id === result.data.id)
            if (exists) return prev
            return [...prev, result.data]
          })
          setError(null)
          return true
        } else {
          setError(result.error || "Failed to post comment")
          return false
        }
      } catch (err) {
        setError("Failed to post comment")
        console.error("[useOrderComments] Error posting comment:", err)
        return false
      } finally {
        setSubmitting(false)
      }
    },
    [itemId, user, getToken],
  )

  useEffect(() => {
    if (user) {
      fetchComments()
    }

    const ably = getAblyBrowserClient()
    const channel = ably.channels.get(`order-comments:${itemId}`)

    const handleCommentMessage = (message: { name?: string; data?: any }) => {
      console.log("[useOrderComments] Real-time update:", message)

      if (message.name === "comment:new") {
        const newComment = message.data as OrderComment
        setComments((prev) => {
          const exists = prev.some((c) => c.id === newComment.id)
          if (exists) return prev
          return [...prev, newComment]
        })

        // Show browser notification
        if (Notification.permission === "granted" && newComment.user_email !== user?.email) {
          new Notification("New Comment", {
            body: `${newComment.user_name}: ${newComment.comment_text.substring(0, 100)}`,
            icon: newComment.user_avatar || "/placeholder.svg?height=48&width=48&text=User",
          })
        }
      } else if (message.name === "comment:update") {
        const updatedComment = message.data as OrderComment
        setComments((prev) => prev.map((c) => (c.id === updatedComment.id ? updatedComment : c)))
      } else if (message.name === "comment:delete") {
        const deletedComment = message.data as OrderComment
        setComments((prev) => prev.filter((c) => c.id !== deletedComment.id))
      }
    }

    channel.subscribe(handleCommentMessage)

    return () => {
      channel.unsubscribe(handleCommentMessage)
    }
  }, [itemId, fetchComments, user])

  return {
    comments,
    loading,
    error,
    submitting,
    postComment,
    refetch: fetchComments,
  }
}
