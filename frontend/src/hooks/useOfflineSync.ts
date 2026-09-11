import { useEffect, useState, useCallback } from "react";
import { get, set, del } from "idb-keyval";
import { apiAutoSaveAnswer } from "../services/api";

const OFFLINE_QUEUE_KEY = "kindle_jr_offline_queue";

export interface PendingAnswerPayload {
  studentId: string;
  questionId: string;
  answer: string;
  currentQuestion: number;
  timestamp: number;
}

export function useOfflineSync(studentId: string) {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const checkPendingCount = useCallback(async () => {
    try {
      const queue: PendingAnswerPayload[] = (await get(OFFLINE_QUEUE_KEY)) || [];
      setPendingCount(queue.length);
    } catch (e) {
      console.warn("Failed to read offline queue from IndexedDB", e);
    }
  }, []);

  const flushQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const queue: PendingAnswerPayload[] = (await get(OFFLINE_QUEUE_KEY)) || [];
      if (queue.length === 0) return;

      for (const item of queue) {
        await apiAutoSaveAnswer({
          studentId: item.studentId,
          questionId: item.questionId,
          answer: item.answer,
          currentQuestion: item.currentQuestion,
        });
      }

      await del(OFFLINE_QUEUE_KEY);
      setPendingCount(0);
      console.log("[OFFLINE SYNC] Successfully flushed offline queued answers to Go backend.");
    } catch (err) {
      console.error("[OFFLINE SYNC] Failed to flush offline queue:", err);
    }
  }, []);

  const queueOfflineAnswer = async (payload: {
    questionId: string;
    answer: string;
    currentQuestion: number;
  }) => {
    try {
      const queue: PendingAnswerPayload[] = (await get(OFFLINE_QUEUE_KEY)) || [];
      // Replace existing pending entry for same questionId or append
      const existingIdx = queue.findIndex((item) => item.questionId === payload.questionId);
      const newItem: PendingAnswerPayload = {
        studentId,
        questionId: payload.questionId,
        answer: payload.answer,
        currentQuestion: payload.currentQuestion,
        timestamp: Date.now(),
      };

      if (existingIdx >= 0) {
        queue[existingIdx] = newItem;
      } else {
        queue.push(newItem);
      }

      await set(OFFLINE_QUEUE_KEY, queue);
      setPendingCount(queue.length);
    } catch (err) {
      console.error("IndexedDB write error:", err);
    }
  };

  useEffect(() => {
    setIsOnline(navigator.onLine);
    checkPendingCount();

    const handleOnline = () => {
      setIsOnline(true);
      flushQueue();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flushQueue, checkPendingCount]);

  return {
    isOnline,
    pendingCount,
    queueOfflineAnswer,
    flushQueue,
  };
}
