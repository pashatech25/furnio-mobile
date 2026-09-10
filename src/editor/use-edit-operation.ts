import { useEffect, useRef } from "react";
import { customerOperations } from "../auth/native-operations";
import { OperationStopped } from "../auth/operation-scope";

/** A late picker, confirmation or server response cannot revive a closed editor. */
export function useEditOperation(userId: string | undefined) {
  const lifetime = useRef<AbortController | null>(null);
  const currentUser = useRef(userId);
  currentUser.current = userId;
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, [userId]);
  return () => {
    if (
      !userId ||
      currentUser.current !== userId ||
      !lifetime.current ||
      lifetime.current.signal.aborted
    )
      throw new OperationStopped();
    return customerOperations.begin(userId, lifetime.current.signal);
  };
}
